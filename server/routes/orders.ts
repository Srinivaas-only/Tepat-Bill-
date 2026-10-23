import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as S from '../../shared/schema';
import { defaultDueAt, matchLine, normalise, poNumber, rankPoCandidates, can, orderState, readyToPay, receivedFromDelivery } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { aliasTableFromRows, cleanPriceList, kl, flagRowToCore, mintSkus, poLineRowToCore, toMyrSen } from '../core-adapters';
import { firstSaveAutofill, loadContext, replaceProposedFlags, runDetection } from '../flags';
import { defaultDeliveryCounts, loadDeliveryContext, supersedeDeliveryFlags } from '../delivery-ctx';
import { toViews } from '../flag-view';
import type { Db } from '../db';
import type { Role } from '../../shared/core';

const DAY = 86_400_000;
/** Postgres error code, whether drizzle wrapped the driver error or not. */
export const pgCode = (e: unknown): string | undefined => (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
export const Box = z.array(z.number().min(-10).max(1010)).length(4).transform(a => a.map(v => Math.max(0, Math.min(1000, Math.round(v))))).nullish();
const Country = z.string().trim().max(60).optional().transform(c => (c && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : undefined));
/** int4 columns hold 2,147,483,647: keep any line or invoice total below 2,000,000,000 sen. */
const MAX_AMOUNT_SEN = 2_000_000_000;
export const Sen = z.number().int().nonnegative().max(100_000_000);
export const SupplierRef = z.object({ supplierId: z.string().optional(), newSupplier: z.object({ name: z.string().trim().min(1).max(120), isForeign: z.boolean().optional(), country: Country }).optional() });

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function resolveSupplier(tx: Tx | Db, ref: z.infer<typeof SupplierRef>, role: Role): Promise<string> {
  if (ref.supplierId) {
    const [s] = await tx.select({ id: S.suppliers.id }).from(S.suppliers).where(eq(S.suppliers.id, ref.supplierId));
    if (!s) throw new ApiError(404, 'not_found', 'Pembekal tiada');
    return s.id;
  }
  if (!ref.newSupplier) throw new ApiError(400, 'bad_request', 'Pembekal diperlukan');
  const name = ref.newSupplier.name.trim();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'supplier:' + name.toLowerCase()}))`);
  const all = await tx.select().from(S.suppliers);
  const same = all.find(s => normalise(s.name) === normalise(name));
  if (same) return same.id;
  const id = `sup_${nanoid(8)}`;
  const foreignOk = can(role, 'edit_supplier');
  await tx.insert(S.suppliers).values({ id, name, isForeign: foreignOk ? !!ref.newSupplier.isForeign : false, country: foreignOk ? ref.newSupplier.country ?? null : null });
  await logEvent(tx, role, 'supplier.create', id, { name });
  return id;
}

export function ordersRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/suppliers', '/pos', '/invoices', '/po-suggestions'], requireAuth);

  r.get('/suppliers', async (_req, res) => {
    const rows = await db.select().from(S.suppliers).orderBy(S.suppliers.name);
    res.json({ suppliers: rows.map(s => ({ id: s.id, name: s.name, whatsapp: s.whatsapp, isForeign: s.isForeign, country: s.country, policyNote: s.policyNote })) });
  });

  r.patch('/suppliers/:id', requireCan('edit_supplier'), async (req, res) => {
    const body = z.object({
      name: z.string().trim().min(1).max(120).optional(), whatsapp: z.string().trim().max(30).nullable().optional(),
      isForeign: z.boolean().optional(), country: z.string().trim().max(60).nullable().transform(c => (c && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : null)).optional(), policyNote: z.string().trim().max(500).nullable().optional(),
    }).safeParse(req.body);
    if (!body.success || Object.keys(body.data).length === 0) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const id = String(req.params.id);
    const [s] = await db.update(S.suppliers).set(body.data).where(eq(S.suppliers.id, id)).returning();
    if (!s) throw new ApiError(404, 'not_found', 'Pembekal tiada');
    await logEvent(db, req.role!, 'supplier.update', id, body.data);
    res.json({ supplier: s });
  });

  // ---- purchase orders
  r.post('/pos', requireCan('correct_extraction'), async (req, res) => {
    const body = SupplierRef.extend({
      documentId: z.string().optional(), source: z.enum(['notebook', 'whatsapp', 'typed']), orderedAt: z.number().int().max(8.64e15).optional(),
      lines: z.array(z.object({ description: z.string().trim().min(1), qty: z.number().int().min(0).max(100000), unit: z.string().trim().max(20).optional(), unitPriceSen: Sen.nullish(), box: Box })).min(1),
    }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah', { issues: z.flattenError(body.error) });
    const b = body.data;
    if (b.lines.some(l => l.qty * (l.unitPriceSen ?? 0) > MAX_AMOUNT_SEN) || b.lines.reduce((t, l) => t + l.qty * (l.unitPriceSen ?? 0), 0) > MAX_AMOUNT_SEN) throw new ApiError(422, 'too_large', 'Jumlah terlalu besar');
    const out = await db.transaction(async tx => {
      const supplierId = await resolveSupplier(tx, b, req.role!);
      const orderedAt = new Date(b.orderedAt ?? Date.now());
      const yymm = poNumber(kl(orderedAt), 0).slice(3, 7);
      const [seqRow] = await tx.execute(sql`insert into settings (key, value) values (${`po_seq:${yymm}`}, to_jsonb(1))
        on conflict (key) do update set value = to_jsonb((settings.value #>> '{}')::int + 1) returning (value #>> '{}')::int as seq`).then(r => r.rows as { seq: number }[]);
      if (b.documentId) {
        const [doc] = await tx.select().from(S.documents).where(eq(S.documents.id, b.documentId));
        if (!doc || doc.kind !== 'po') throw new ApiError(422, 'bad_document', 'Dokumen tidak sah');
        const [used] = await tx.select({ id: S.purchaseOrders.id }).from(S.purchaseOrders).where(eq(S.purchaseOrders.documentId, b.documentId));
        if (used) throw new ApiError(409, 'duplicate_document', 'Dokumen ini sudah digunakan untuk pesanan lain');
      }
      const poNo = poNumber(kl(orderedAt), seqRow.seq);
      const existing = await tx.select({ sku: S.priceList.sku }).from(S.priceList).where(eq(S.priceList.supplierId, supplierId));
      const skus = mintSkus(b.lines.map(l => l.description), existing.map(e => e.sku));
      const id = `po_${nanoid(10)}`;
      await tx.insert(S.purchaseOrders).values({ id, poNo, supplierId, documentId: b.documentId ?? null, source: b.source, orderedAt });
      await tx.insert(S.poLines).values(b.lines.map((l, i) => ({
        id: `${id}_${i + 1}`, poId: id, sku: skus[i], description: l.description, orderedQty: l.qty, unit: l.unit || null,
        unitPriceSen: l.unitPriceSen ?? null, box: (l.box ?? null) as S.Box | null, position: i,
      })));
      await logEvent(tx, req.role!, 'po.create', id, { poNo });
      return { id, poNo };
    });
    res.status(201).json(out);
  });

  r.get('/pos', async (req, res) => {
    const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;
    const days = Number(req.query.days) || 0;
    const conds = [supplierId ? eq(S.purchaseOrders.supplierId, supplierId) : undefined, days ? gte(S.purchaseOrders.orderedAt, new Date(Date.now() - days * DAY)) : undefined].filter(Boolean) as ReturnType<typeof eq>[];
    const rows = await db.select({ po: S.purchaseOrders, supplierName: S.suppliers.name }).from(S.purchaseOrders)
      .innerJoin(S.suppliers, eq(S.suppliers.id, S.purchaseOrders.supplierId)).where(conds.length ? and(...conds) : undefined).orderBy(desc(S.purchaseOrders.orderedAt)).limit(100);
    const counts = rows.length ? await db.select({ poId: S.poLines.poId, n: sql<number>`count(*)::int` }).from(S.poLines).where(inArray(S.poLines.poId, rows.map(x => x.po.id))).groupBy(S.poLines.poId) : [];
    res.json({ pos: rows.map(x => ({ id: x.po.id, poNo: x.po.poNo, supplierId: x.po.supplierId, supplierName: x.supplierName, orderedAt: x.po.orderedAt.getTime(), source: x.po.source, lineCount: counts.find(c => c.poId === x.po.id)?.n ?? 0 })) });
  });

  r.get('/pos/:id', async (req, res) => {
    const id = String(req.params.id);
    const [row] = await db.select({ po: S.purchaseOrders, supplierName: S.suppliers.name }).from(S.purchaseOrders).innerJoin(S.suppliers, eq(S.suppliers.id, S.purchaseOrders.supplierId)).where(eq(S.purchaseOrders.id, id));
    if (!row) throw new ApiError(404, 'not_found', 'PO tiada');
    const lines = await db.select().from(S.poLines).where(eq(S.poLines.poId, id)).orderBy(S.poLines.position);
    res.json({ po: { id, poNo: row.po.poNo, supplierId: row.po.supplierId, supplierName: row.supplierName, documentId: row.po.documentId, orderedAt: row.po.orderedAt.getTime(), source: row.po.source }, lines });
  });

  /** PO suggestion for an invoice that is still being reviewed (the saved-invoice variant is not needed: the review screen shows the chip before save). */
  r.post('/po-suggestions', async (req, res) => {
    const body = z.object({ supplierId: z.string().optional(), supplierName: z.string().default(''), lines: z.array(z.object({ description: z.string() })), issuedAt: z.number().int().optional() }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const since = new Date(Date.now() - 60 * DAY);
    const pos = await db.select({ po: S.purchaseOrders, supplierName: S.suppliers.name }).from(S.purchaseOrders).innerJoin(S.suppliers, eq(S.suppliers.id, S.purchaseOrders.supplierId))
      .where(and(gte(S.purchaseOrders.orderedAt, since), body.data.supplierId ? eq(S.purchaseOrders.supplierId, body.data.supplierId) : undefined));
    const lineRows = pos.length ? await db.select().from(S.poLines).where(inArray(S.poLines.poId, pos.map(p => p.po.id))) : [];
    const cands = pos.map(p => ({ id: p.po.id, supplierName: p.supplierName, orderedAt: p.po.orderedAt.getTime(), lines: lineRows.filter(l => l.poId === p.po.id).map(poLineRowToCore) }));
    const ranked = rankPoCandidates({ supplierName: body.data.supplierName, issuedAt: body.data.issuedAt ?? Date.now(), lines: body.data.lines }, cands);
    res.json({ candidates: ranked.map(c => { const p = pos.find(x => x.po.id === c.id)!; return { id: c.id, score: c.score, poNo: p.po.poNo, supplierName: p.supplierName, orderedAt: p.po.orderedAt.getTime() }; }) });
  });

  // ---- invoices
  r.post('/invoices', requireCan('correct_extraction'), async (req, res) => {
    const body = SupplierRef.extend({
      documentId: z.string().optional(), poId: z.string().nullish(), deliveryId: z.string().optional(), invoiceNo: z.string().trim().min(1).max(60), docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      currency: z.string().trim().length(3).default('MYR'), exchangeRateBp: z.number().int().positive().optional(),
      totalSen: Sen.optional(), totalForeignMinor: Sen.optional(),
      lines: z.array(z.object({ description: z.string().trim().min(1), qty: z.number().int().min(0).max(100000), unit: z.string().trim().max(20).optional(), unitPriceSen: Sen.optional(), unitPriceForeignMinor: Sen.optional(), box: Box })).min(1),
    }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah', { issues: z.flattenError(body.error) });
    const b = body.data;
    const currency = b.currency.toUpperCase();
    const foreign = currency !== 'MYR';
    if (foreign && !b.exchangeRateBp) throw new ApiError(422, 'rate_required', 'Kadar tukaran diperlukan');
    if (!foreign && b.lines.some(l => l.unitPriceSen === undefined)) throw new ApiError(422, 'price_required', 'Harga diperlukan');
    if (foreign && b.lines.some(l => l.unitPriceForeignMinor === undefined)) throw new ApiError(422, 'price_required', 'Harga diperlukan');
    let supId: string | undefined;
    const out = await db.transaction(async tx => {
      const supplierId = await resolveSupplier(tx, b, req.role!);
      supId = supplierId;
      const dup = (await tx.select({ id: S.invoices.id, no: S.invoices.invoiceNo }).from(S.invoices).where(eq(S.invoices.supplierId, supplierId))).find(i => i.no.trim().toLowerCase() === b.invoiceNo.toLowerCase());
      if (dup) throw new ApiError(409, 'duplicate_invoice', 'Invois ini sudah ada', { invoiceId: dup.id });
      let po: ReturnType<typeof poLineRowToCore>[] = [];
      if (b.poId) {
        const [p] = await tx.select({ id: S.purchaseOrders.id, supplierId: S.purchaseOrders.supplierId }).from(S.purchaseOrders).where(eq(S.purchaseOrders.id, b.poId));
        if (!p) throw new ApiError(404, 'not_found', 'PO tiada');
        if (p.supplierId !== supplierId) throw new ApiError(422, 'po_supplier_mismatch', 'PO bukan daripada pembekal ini');
        po = (await tx.select().from(S.poLines).where(eq(S.poLines.poId, b.poId))).map(poLineRowToCore);
      }
      const aliases = aliasTableFromRows(await tx.select().from(S.aliases).where(eq(S.aliases.supplierId, supplierId)));
      const lines = b.lines.map((l, i) => {
        const unitPriceSen = foreign ? toMyrSen(l.unitPriceForeignMinor!, b.exchangeRateBp!) : l.unitPriceSen!;
        const m = po.length ? matchLine(supplierId, { lineId: `L${i + 1}`, description: l.description, qty: l.qty, unitPriceSen }, po, aliases) : undefined;
        return { ...l, unitPriceSen, sku: m?.sku ?? null };
      });
      const sum = lines.reduce((a, l) => a + l.qty * l.unitPriceSen, 0);
      if (lines.some(l => l.qty * l.unitPriceSen > MAX_AMOUNT_SEN) || sum > MAX_AMOUNT_SEN) throw new ApiError(422, 'too_large', 'Jumlah terlalu besar');
      const totalSen = foreign && b.totalForeignMinor !== undefined ? toMyrSen(b.totalForeignMinor, b.exchangeRateBp!) : b.totalSen ?? sum;
      if (b.documentId) {
        const [doc] = await tx.select().from(S.documents).where(eq(S.documents.id, b.documentId));
        const [taken] = doc ? await tx.select({ id: S.invoices.id }).from(S.invoices).where(eq(S.invoices.documentId, doc.id)) : [];
        if (!doc || doc.kind !== 'invoice' || doc.invoiceId || taken) throw new ApiError(422, 'bad_document', 'Dokumen tidak sah');
      }
      const [ext] = b.documentId ? await tx.select({ model: S.extractions.model }).from(S.documents).innerJoin(S.extractions, eq(S.extractions.sha256, S.documents.sha256)).where(eq(S.documents.id, b.documentId)) : [];
      const id = `inv_${nanoid(10)}`;
      const issuedAt = new Date();
      await tx.insert(S.invoices).values({
        id, invoiceNo: b.invoiceNo, supplierId, poId: b.poId ?? null, documentId: b.documentId ?? null, docDate: b.docDate ?? null, currency,
        exchangeRateBp: foreign ? b.exchangeRateBp! : null, totalForeignMinor: foreign ? b.totalForeignMinor ?? null : null, totalSen, issuedAt,
        payment: 'on_credit', dueAt: new Date(defaultDueAt(issuedAt.getTime())), extractionModel: ext?.model ?? 'manual',
      });
      await tx.insert(S.invoiceLines).values(lines.map((l, i) => ({
        id: `${id}_L${i + 1}`, invoiceId: id, lineId: `L${i + 1}`, sku: l.sku, description: l.description, qty: l.qty, unit: l.unit || null,
        unitPriceSen: l.unitPriceSen, unitPriceForeignMinor: foreign ? l.unitPriceForeignMinor! : null, lineTotalSen: l.qty * l.unitPriceSen,
        box: (l.box ?? null) as S.Box | null, position: i,
      })));
      if (b.documentId) await tx.update(S.documents).set({ invoiceId: id }).where(eq(S.documents.id, b.documentId));
      await logEvent(tx, req.role!, 'invoice.create', id, { invoiceNo: b.invoiceNo });
      if (!b.deliveryId) return { id };
      // compare flow: the invoice is checked against what the linked delivery received (no recount)
      const [del] = await tx.select().from(S.deliveries).where(eq(S.deliveries.id, b.deliveryId));
      if (!del) throw new ApiError(404, 'not_found', 'Penghantaran tiada');
      if (del.supplierId !== supplierId) throw new ApiError(422, 'delivery_supplier_mismatch', 'Penghantaran bukan daripada pembekal ini');
      const [linked] = await tx.update(S.deliveries).set({ invoiceId: id }).where(and(eq(S.deliveries.id, del.id), isNull(S.deliveries.invoiceId))).returning({ id: S.deliveries.id });
      if (!linked) throw new ApiError(409, 'delivery_linked', 'Penghantaran ini sudah dibandingkan dengan invois lain');
      const c = await loadContext(tx, id);
      const dc = await loadDeliveryContext(tx, del.id);
      if (!c || !dc) throw new ApiError(404, 'not_found', 'Invois tiada');
      const received = receivedFromDelivery({ supplierId, po: c.po, deliveryLines: dc.delLines, deliveryReceived: { ...defaultDeliveryCounts(dc), ...dc.saved }, invoiceLines: c.invLines, aliases: c.aliases });
      const detected = runDetection(c, received, c.priceNow);
      await tx.update(S.invoices).set({ priceListSnapshot: cleanPriceList(c.priceNow) }).where(eq(S.invoices.id, id));
      await firstSaveAutofill(tx, c, detected);
      await tx.insert(S.receivedCounts).values(Object.entries(received).map(([key, qty]) => ({ invoiceId: id, key, qty, recordedByRole: req.role! })));
      await replaceProposedFlags(tx, c, detected);
      const rows = await tx.select().from(S.flags).where(eq(S.flags.invoiceId, id));
      await supersedeDeliveryFlags(tx, del.id, rows);
      await logEvent(tx, req.role!, 'invoice.compare', id, { deliveryId: del.id, flags: detected.length });
      const flags = await toViews(tx, rows);
      return { id, compared: true, flags, totalSen, readyToPay: readyToPay(detected) };
    }).catch(async e => {
      if (pgCode(e) === '23505' && supId) {
        const [dup] = (await db.select({ id: S.invoices.id, no: S.invoices.invoiceNo }).from(S.invoices).where(eq(S.invoices.supplierId, supId))).filter(i => i.no.trim().toLowerCase() === b.invoiceNo.toLowerCase());
        if (dup) throw new ApiError(409, 'duplicate_invoice', 'Invois ini sudah ada', { invoiceId: dup.id });
      }
      throw e;
    });
    res.status(201).json(out);
  });

  r.get('/invoices', async (_req, res) => {
    const rows = await db.select({ inv: S.invoices, supplierName: S.suppliers.name }).from(S.invoices).innerJoin(S.suppliers, eq(S.suppliers.id, S.invoices.supplierId)).orderBy(desc(S.invoices.issuedAt)).limit(100);
    const fl = rows.length ? (await db.select().from(S.flags).where(inArray(S.flags.invoiceId, rows.map(x => x.inv.id)))).map(f => flagRowToCore(f)) : [];
    res.json({ invoices: rows.map(x => ({ state: orderState(x.inv.id, fl, x.inv.ownerMarkedCorrect), id: x.inv.id, invoiceNo: x.inv.invoiceNo, supplierId: x.inv.supplierId, supplierName: x.supplierName, totalSen: x.inv.totalSen, currency: x.inv.currency, issuedAt: x.inv.issuedAt.getTime(), payment: x.inv.payment })) });
  });
  return r;
}
