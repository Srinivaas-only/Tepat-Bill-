import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as S from '../../shared/schema';
import { defaultDueAt, matchLine, normalise, poNumber, rankPoCandidates, can } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { aliasTableFromRows, mintSkus, poLineRowToCore, toMyrSen } from '../core-adapters';
import type { Db } from '../db';
import type { Role } from '../../shared/core';

const DAY = 86_400_000;
const Box = z.array(z.number().int()).length(4).nullish();
const Sen = z.number().int().nonnegative();
const SupplierRef = z.object({ supplierId: z.string().optional(), newSupplier: z.object({ name: z.string().trim().min(1).max(120), isForeign: z.boolean().optional(), country: z.string().max(4).optional() }).optional() });

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function resolveSupplier(tx: Tx | Db, ref: z.infer<typeof SupplierRef>, role: Role): Promise<string> {
  if (ref.supplierId) {
    const [s] = await tx.select({ id: S.suppliers.id }).from(S.suppliers).where(eq(S.suppliers.id, ref.supplierId));
    if (!s) throw new ApiError(404, 'not_found', 'Pembekal tiada');
    return s.id;
  }
  if (!ref.newSupplier) throw new ApiError(400, 'bad_request', 'Pembekal diperlukan');
  const name = ref.newSupplier.name;
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
      isForeign: z.boolean().optional(), country: z.string().trim().max(4).nullable().optional(), policyNote: z.string().trim().max(500).nullable().optional(),
    }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const id = String(req.params.id);
    const [s] = await db.update(S.suppliers).set(body.data).where(eq(S.suppliers.id, id)).returning();
    if (!s) throw new ApiError(404, 'not_found', 'Pembekal tiada');
    await logEvent(db, req.role!, 'supplier.update', id, body.data);
    res.json({ supplier: s });
  });

  // ---- purchase orders
  r.post('/pos', requireCan('correct_extraction'), async (req, res) => {
    const body = SupplierRef.extend({
      documentId: z.string().optional(), source: z.enum(['notebook', 'whatsapp', 'typed']), orderedAt: z.number().int().optional(),
      lines: z.array(z.object({ description: z.string().trim().min(1), qty: z.number().int().min(0).max(100000), unit: z.string().trim().max(20).optional(), unitPriceSen: Sen.nullish(), box: Box })).min(1),
    }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah', { issues: z.flattenError(body.error) });
    const b = body.data;
    const out = await db.transaction(async tx => {
      const supplierId = await resolveSupplier(tx, b, req.role!);
      const orderedAt = new Date(b.orderedAt ?? Date.now());
      const yymm = poNumber(orderedAt, 0).slice(3, 7);
      const [seqRow] = await tx.execute(sql`insert into settings (key, value) values (${`po_seq:${yymm}`}, to_jsonb(1))
        on conflict (key) do update set value = to_jsonb((settings.value #>> '{}')::int + 1) returning (value #>> '{}')::int as seq`).then(r => r.rows as { seq: number }[]);
      if (b.documentId) {
        const [doc] = await tx.select().from(S.documents).where(eq(S.documents.id, b.documentId));
        if (!doc || doc.kind !== 'po') throw new ApiError(422, 'bad_document', 'Dokumen tidak sah');
      }
      const poNo = poNumber(orderedAt, seqRow.seq);
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
      documentId: z.string().optional(), poId: z.string().nullish(), invoiceNo: z.string().trim().min(1).max(60), docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    const out = await db.transaction(async tx => {
      const supplierId = await resolveSupplier(tx, b, req.role!);
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
      return { id };
    });
    res.status(201).json(out);
  });

  r.get('/invoices', async (_req, res) => {
    const rows = await db.select({ inv: S.invoices, supplierName: S.suppliers.name }).from(S.invoices).innerJoin(S.suppliers, eq(S.suppliers.id, S.invoices.supplierId)).orderBy(desc(S.invoices.issuedAt)).limit(100);
    res.json({ invoices: rows.map(x => ({ id: x.inv.id, invoiceNo: x.inv.invoiceNo, supplierId: x.inv.supplierId, supplierName: x.supplierName, totalSen: x.inv.totalSen, currency: x.inv.currency, issuedAt: x.inv.issuedAt.getTime(), payment: x.inv.payment })) });
  });
  return r;
}
