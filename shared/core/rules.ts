// Flag rules. Pure functions, integer sen, no floats. The AI never runs this logic; it only supplies the inputs.
export type Sen = number;
export const assertSen = (n: number, what = 'sen'): Sen => {
  if (!Number.isSafeInteger(n)) throw new Error(`${what} must be integer sen, got ${n}`);
  return n;
};
export const assertQty = (n: number, what = 'qty'): number => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${what} must be a non-negative integer, got ${n}`);
  return n;
};
export const formatRM = (sen: Sen): string => {
  assertSen(sen);
  const a = Math.abs(sen);
  return `${sen < 0 ? '-' : ''}RM${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`;
};
/** "45", "45.5", "45.50", "1,250.00" -> sen. Throws on anything else. Used to parse AI-read prices. */
export const parseRM = (s: string): Sen => {
  const t = s.replace(/^RM\s*/i, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error(`not a ringgit amount: "${s}"`);
  const [r, c = ''] = t.split('.');
  return Number(r) * 100 + Number(c.padEnd(2, '0'));
};

// ---------- item matching ----------
export const normalise = (s: string) => {
  const n = s.toLowerCase().replace(/(\d+)\s+(kg|g|ml|l|pcs|pc)\b/g, '$1$2').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return n || s.toLowerCase().trim(); // never an empty key (e.g. a description of only symbols)
};
const tokens = (s: string) => new Set(normalise(s).split(' ').filter(Boolean));
export function tokenOverlap(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size); // overlap coefficient
}
/** Alias table: per supplier, normalised invoice description -> PO sku. Learned from owner corrections. */
export type AliasTable = Record<string /*supplierId*/, Record<string /*normalised desc*/, string /*sku*/>>;
export const learnAlias = (t: AliasTable, supplierId: string, invoiceDesc: string, sku: string): AliasTable =>
  ({ ...t, [supplierId]: { ...(t[supplierId] ?? {}), [normalise(invoiceDesc)]: sku } });

export interface PoLine { sku: string; description: string; orderedQty: number; unitPriceSen?: Sen }
export interface InvLine { lineId: string; description: string; qty: number; unitPriceSen: Sen; box?: [number, number, number, number] }

export const MATCH_THRESHOLD = 0.6;
/** Pack-size tokens ("5kg", "500g", "1l", "600ml"). Two descriptions that BOTH state a size must state the same one. */
const sizeTokens = (s: string) => new Set(normalise(s).split(' ').filter(t => /^\d+(kg|g|ml|l)$/.test(t)));
export function sameSize(a: string, b: string): boolean {
  const A = sizeTokens(a), B = sizeTokens(b);
  if (!A.size || !B.size) return true;
  for (const t of A) if (B.has(t)) return true;
  return false;
}
/** Alias first (exact, owner-confirmed; a stale alias to a sku not on this PO is ignored), then best token overlap >= threshold. */
export function matchLine(supplierId: string, inv: InvLine, po: PoLine[], aliases: AliasTable): PoLine | undefined {
  const aliased = aliases[supplierId]?.[normalise(inv.description)];
  const hit = aliased ? po.find(p => p.sku === aliased) : undefined;
  if (hit) return hit;
  let best: PoLine | undefined, score = 0;
  for (const p of po) {
    if (!sameSize(inv.description, p.description)) continue; // "Minyak 5kg" is not "Minyak 1kg"
    const s = tokenOverlap(inv.description, p.description); if (s > score) { score = s; best = p; }
  }
  return score >= MATCH_THRESHOLD ? best : undefined;
}

// ---------- price list ----------
export interface PriceEntry { lastInvoiceSen?: Sen; agreedSen?: Sen }
export type PriceList = Record<string /*sku*/, PriceEntry>;
export type BaselineSource = 'agreed' | 'po' | 'last_invoice';
/** Baseline chain: owner-agreed price -> price written on the PO line -> last invoice price -> none. */
export function baseline(e: PriceEntry | undefined, po?: PoLine): { sen: Sen; source: BaselineSource } | undefined {
  if (e?.agreedSen !== undefined) return { sen: e.agreedSen, source: 'agreed' };
  if (po?.unitPriceSen !== undefined && po.unitPriceSen > 0) return { sen: po.unitPriceSen, source: 'po' };
  if (e?.lastInvoiceSen !== undefined && e.lastInvoiceSen > 0) return { sen: e.lastInvoiceSen, source: 'last_invoice' };  // a free-of-charge line is not a price
  return undefined;
}
export const setAgreedPrice = (pl: PriceList, sku: string, sen: Sen): PriceList =>
  ({ ...pl, [sku]: { ...pl[sku], agreedSen: assertSen(sen) } });
/** "Ini kenaikan biasa": the owner accepts this price as the new normal. Wins over an older agreed price and over the PO price. */
export const acceptPrice = (pl: PriceList, sku: string, sen: Sen): PriceList =>
  ({ ...pl, [sku]: { ...pl[sku], agreedSen: assertSen(sen), lastInvoiceSen: sen } });
/**
 * Auto-fill from an invoice. A line whose price is under an unresolved price flag does NOT
 * overwrite the baseline (otherwise a disputed increase silently becomes the new normal).
 * Dismissing a price change as normal inflation = call this WITHOUT skipping that sku.
 */
export function autofillPriceList(pl: PriceList, lines: { sku: string; unitPriceSen: Sen }[], skipSkus: Set<string> = new Set()): PriceList {
  const out: PriceList = { ...pl };
  for (const l of lines) if (!skipSkus.has(l.sku) && assertSen(l.unitPriceSen) > 0) out[l.sku] = { ...out[l.sku], lastInvoiceSen: l.unitPriceSen };
  return out;
}

// ---------- flags ----------
export type FlagType = 'short_qty' | 'price_change' | 'not_ordered';
export interface DetectedFlag {
  type: FlagType; sku?: string; invoiceLineId: string;
  amountSen: Sen;          // claimable amount (what a credit note / deduction would be)
  missingQty?: number; invoiceUnitSen?: Sen; pricedQty?: number;
  baselineUnitSen?: Sen; baselineSource?: BaselineSource;
  direction?: 'up' | 'down';
  /** not_ordered only: a PO sku that was ordered, not billed under its own name and received 0 -> UI shows "Substituted?" */
  possibleSubstituteFor?: string;
}

export interface LineCheckInput {
  supplierId: string;
  po: PoLine[];
  invoice: InvLine[];
  /** Staff counts. Key `line:<lineId>` = count for that invoice line (preferred; survives re-matching after a substitution link).
   *  Key `<sku>` = count for a PO sku (used for PO lines the invoice didn't bill, and as a fallback). */
  received: Record<string, number>;
  priceList: PriceList;                       // the supplier's list BEFORE this invoice
  aliases: AliasTable;
}

/**
 * Rules (final):
 *  short_qty   : missing = invoiceQty - receivedQty (only if > 0). amount = missing x INVOICE unit price.
 *                If invoiceQty <= received (supplier billed only what arrived) -> NO money flag, even if received < PO.
 *  price_change: baseline chain agreed -> PO price -> last invoice. None (first invoice) -> no flag.
 *                amount = (invoiceUnit - baseline) x min(invoiceQty, received): price impact only on units actually received,
 *                so a line that is both short and re-priced is never double counted.
 *                Invariant: short + price = invoiceQty*invoiceUnit - min(invoiceQty,received)*baseline  (billed - fair value).
 *                Decreases are flagged (direction 'down') for owner info, amountSen = 0 (nothing to claim).
 *  not_ordered : invoice line with no PO match (alias, then token overlap) -> amount = qty x invoice unit price.
 *                If a PO line is unmatched by every invoice line AND received 0, it is offered as possibleSubstituteFor.
 */
export function detectFlags(i: LineCheckInput): DetectedFlag[] {
  const out: DetectedFlag[] = [];
  const matched = new Set<string>();
  const unmatched: InvLine[] = [];
  for (const line of i.invoice) {
    assertQty(line.qty, 'invoice qty'); assertSen(line.unitPriceSen, 'invoice unit price');
    const m = matchLine(i.supplierId, line, i.po, i.aliases);
    if (!m) { unmatched.push(line); continue; }
    matched.add(m.sku);
    const rec = assertQty(i.received[`line:${line.lineId}`] ?? i.received[m.sku] ?? 0, 'received qty');
    const missing = line.qty - rec;
    if (missing > 0) out.push({ type: 'short_qty', sku: m.sku, invoiceLineId: line.lineId, missingQty: missing,
      invoiceUnitSen: line.unitPriceSen, amountSen: missing * line.unitPriceSen });
    const b = baseline(i.priceList[m.sku], m);
    const pricedQty = Math.min(line.qty, rec);
    if (b !== undefined && b.sen !== line.unitPriceSen && pricedQty > 0) {   // nothing received -> nothing to re-price (the shortage covers it)
      const diff = line.unitPriceSen - b.sen;
      out.push({ type: 'price_change', sku: m.sku, invoiceLineId: line.lineId, invoiceUnitSen: line.unitPriceSen,
        baselineUnitSen: b.sen, baselineSource: b.source, pricedQty, direction: diff > 0 ? 'up' : 'down',
        amountSen: diff > 0 ? diff * pricedQty : 0 });
    }
  }
  const substituteCandidates = i.po.filter(p => !matched.has(p.sku) && (i.received[p.sku] ?? 0) === 0);
  for (const line of unmatched) {
    out.push({ type: 'not_ordered', invoiceLineId: line.lineId, amountSen: line.qty * line.unitPriceSen,
      invoiceUnitSen: line.unitPriceSen, possibleSubstituteFor: substituteCandidates.shift()?.sku });
  }
  return out;
}

// ---------- documents ----------
/** PO numbers: PO-YYMM-### (sequence per month, 1-based). */
export const poNumber = (date: Date, seq: number): string =>
  `PO-${String(date.getFullYear() % 100).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(3, '0')}`;

const COMPANY_WORDS = new Set(['sdn', 'bhd', 'syarikat', 'enterprise', 'enterprises', 'trading', 'co', 'company', 'ltd', 'limited', 'kedai', 'pte', 'inc', 'berhad']);
/** Supplier-name similarity that ignores company words, so "Borong Ali Sdn Bhd" is not "Borong Abu Sdn Bhd". */
export function supplierOverlap(a: string, b: string): number {
  const core = (s: string) => new Set(normalise(s).split(' ').filter(t => t && !COMPANY_WORDS.has(t)));
  const A = core(a), B = core(b);
  if (!A.size || !B.size) return tokenOverlap(a, b);
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}
export interface PoCandidate { id: string; supplierName: string; orderedAt: number; lines: PoLine[] }
/** Suggest the PO an invoice belongs to: supplier name 0.5 + item overlap 0.4 + date closeness 0.1. Highest first. */
export function rankPoCandidates(inv: { supplierName: string; issuedAt: number; lines: { description: string }[] }, pos: PoCandidate[]) {
  const DAY = 86_400_000;
  return pos.map(p => {
    const name = supplierOverlap(inv.supplierName, p.supplierName);
    const hits = inv.lines.filter(l => p.lines.some(pl => sameSize(l.description, pl.description) && tokenOverlap(l.description, pl.description) >= MATCH_THRESHOLD)).length;
    const items = inv.lines.length ? hits / inv.lines.length : 0;
    const days = Math.abs(inv.issuedAt - p.orderedAt) / DAY;
    const date = Math.max(0, 1 - days / 30);
    return { id: p.id, score: 0.5 * name + 0.4 * items + 0.1 * date };
  }).sort((a, b) => b.score - a.score);
}

/** Foreign supplier suggestion from AI-read currency / country (owner confirms). */
export const looksForeign = (currency?: string, country?: string): boolean => {
  const cur = currency?.trim().toUpperCase(), cty = country?.trim().toUpperCase();
  return (!!cur && !['MYR', 'RM', 'RINGGIT', 'RINGGIT MALAYSIA'].includes(cur)) || (!!cty && !['MY', 'MYS', 'MALAYSIA'].includes(cty));
};
