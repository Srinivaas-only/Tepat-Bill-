// DB rows <-> shared/core types. The only place that converts Dates to ms epoch and foreign minor units to MYR sen.
import type { InferSelectModel } from 'drizzle-orm';
import type * as S from '../shared/schema';
import { normalise, sameSize, tokenOverlap, MATCH_THRESHOLD, type AliasTable, type DetectedFlag, type InvLine, type PoLine, type PriceList, type BaselineSource, type FlagType } from '../shared/core';
import type { Flag, Invoice, FlagStatus, Settlement, FlagRequest } from '../shared/core';

export type FlagRow = InferSelectModel<typeof S.flags>;
export type InvoiceRow = InferSelectModel<typeof S.invoices>;
export type InvoiceLineRow = InferSelectModel<typeof S.invoiceLines>;
export type PoLineRow = InferSelectModel<typeof S.poLines>;
export type PriceRow = InferSelectModel<typeof S.priceList>;
export type AliasRow = InferSelectModel<typeof S.aliases>;

export const ms = (d: Date | null | undefined): number | undefined => (d ? d.getTime() : undefined);
export const dateOf = (n: number | undefined | null): Date | null => (n === undefined || n === null ? null : new Date(n));

/** MYR sen = round(foreignMinor * bp / 10000). Foreign conversion happens ONLY here. */
export const toMyrSen = (foreignMinor: number, bp: number): number => Math.round((foreignMinor * bp) / 10000);

/** sku = slug of the description at PO creation. */
export const slug = (desc: string) => normalise(desc).replace(/ /g, '-');

export function flagRowToCore(r: FlagRow, photoIds: string[] = []): Flag {
  return {
    id: r.id, supplierId: r.supplierId, invoiceId: r.invoiceId ?? r.deliveryId ?? '', poId: r.poId ?? '', invoiceLineId: r.invoiceLineId,
    type: r.type as FlagType, amountSen: r.amountSen, status: r.status as FlagStatus,
    settlement: (r.settlement ?? undefined) as Settlement | undefined,
    request: (r.request ?? undefined) as FlagRequest | undefined,
    baselineUnitSen: r.baselineUnitSen ?? undefined, baselineSource: (r.baselineSource ?? undefined) as BaselineSource | undefined,
    openedAt: ms(r.openedAt), sentAt: ms(r.sentAt), settledAt: ms(r.settledAt), photoIds,
  };
}

/** Core Flag -> the columns a transition can change. */
export const flagCoreToPatch = (f: Flag) => ({
  status: f.status, settlement: f.settlement ?? null, request: f.request ?? null,
  openedAt: dateOf(f.openedAt), sentAt: dateOf(f.sentAt), settledAt: dateOf(f.settledAt),
});

export function invoiceRowToCore(r: InvoiceRow): Invoice {
  return {
    id: r.id, supplierId: r.supplierId, poId: r.poId ?? '', invoiceNo: r.invoiceNo, totalSen: r.totalSen,
    issuedAt: r.issuedAt.getTime(), payment: r.payment as Invoice['payment'], paidAt: ms(r.paidAt), dueAt: r.dueAt.getTime(),
  };
}

export const invLineRowToCore = (l: InvoiceLineRow): InvLine => ({
  lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: l.unitPriceSen, box: (l.box ?? undefined) as InvLine['box'],
});

export const poLineRowToCore = (l: PoLineRow): PoLine => ({
  sku: l.sku, description: l.description, orderedQty: l.orderedQty, unitPriceSen: l.unitPriceSen ?? undefined,
});

export function priceListFromRows(rows: PriceRow[]): PriceList {
  const out: PriceList = {};
  for (const r of rows) out[r.sku] = { lastInvoiceSen: r.lastInvoiceSen ?? undefined, agreedSen: r.agreedSen ?? undefined };
  return out;
}
/** Strip undefined so jsonb snapshots stay clean. */
export const cleanPriceList = (pl: PriceList): PriceList =>
  Object.fromEntries(Object.entries(pl).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined))])) as PriceList;

export function aliasTableFromRows(rows: AliasRow[]): AliasTable {
  const t: AliasTable = {};
  for (const r of rows) (t[r.supplierId] ??= {})[r.normalisedDesc] = r.sku;
  return t;
}

/** DetectedFlag -> flag insert values (id/token supplied by caller). */
export const detectedToRow = (d: DetectedFlag, base: { id: string; token: string; supplierId: string; invoiceId: string | null; poId: string | null; stage?: 'invoice' | 'delivery'; deliveryId?: string | null }) => ({
  id: base.id, evidenceToken: base.token, supplierId: base.supplierId, invoiceId: base.invoiceId, poId: base.poId,
  stage: base.stage ?? 'invoice', deliveryId: base.deliveryId ?? null,
  invoiceLineId: d.invoiceLineId, sku: d.sku ?? null, type: d.type, amountSen: d.amountSen, status: 'proposed' as const,
  missingQty: d.missingQty ?? null, invoiceUnitSen: d.invoiceUnitSen ?? null, baselineUnitSen: d.baselineUnitSen ?? null,
  baselineSource: d.baselineSource ?? null, pricedQty: d.pricedQty ?? null, direction: d.direction ?? null,
  possibleSubstituteFor: d.possibleSubstituteFor ?? null,
});

/**
 * Best near-match of a description among skus: the words must overlap >= 0.6 in BOTH directions and by Jaccard (overlap alone lets
 * "gula perang 1kg" match "gula pasir 1kg"). Highest Jaccard wins; `exclude` skips skus already taken.
 */
export function nearSku(description: string, skus: string[], exclude: Set<string> = new Set()): string | undefined {
  let best = 0; let near: string | undefined;
  for (const sku of skus) {
    if (exclude.has(sku)) continue;
    const text = sku.replace(/[-_]/g, ' ');
    const a = tokenOverlap(description, text), b = tokenOverlap(text, description);
    const A = new Set(normalise(description).split(' ')), B = new Set(normalise(text).split(' '));
    const jac = [...A].filter(x => B.has(x)).length / new Set([...A, ...B]).size;
    if (a >= MATCH_THRESHOLD && b >= MATCH_THRESHOLD && jac >= MATCH_THRESHOLD && sameSize(description, text) && jac > best) { best = jac; near = sku; }
  }
  return near;
}

/** sku minting (notes 18): reuse an existing supplier sku on a near-match, else slug; duplicates within one PO get -2, -3. */
export function mintSkus(descriptions: string[], existingSkus: string[]): string[] {
  const used = new Set<string>();
  return descriptions.map(d => {
    const base = nearSku(d, existingSkus) ?? (slug(d) || 'item');
    let sku = base, n = 2;
    while (used.has(sku)) sku = `${base}-${n++}`;
    used.add(sku);
    return sku;
  });
}

// ---- Asia/Kuala_Lumpur wall clock, independent of the process TZ
const KL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
/** A Date whose LOCAL getters read Kuala Lumpur time (feed it to poNumber, dmy, ymd). */
export function kl(d: Date): Date {
  const p = Object.fromEntries(KL.formatToParts(d).map(x => [x.type, x.value]));
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}
const two = (n: number) => String(n).padStart(2, '0');
export const dmy = (d: Date) => { const k = kl(d); return `${two(k.getDate())}/${two(k.getMonth() + 1)}/${k.getFullYear()}`; };
export const ymd = (d: Date) => { const k = kl(d); return `${k.getFullYear()}-${two(k.getMonth() + 1)}-${two(k.getDate())}`; };
