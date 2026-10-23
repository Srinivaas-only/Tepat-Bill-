// Delivery stage: the bon/DO is read and counted when the goods arrive; the invoice is compared to it later.
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as S from '../../shared/schema';
import { canMarkCorrect, claimableSen, matchLine } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { aliasTableFromRows, flagRowToCore, poLineRowToCore } from '../core-adapters';
import { attachDeliveryPhotos, defaultDeliveryCounts, loadDeliveryContext, replaceProposedDeliveryFlags, runDeliveryCheck } from '../delivery-ctx';
import { lockDelivery } from '../flag-ops';
import { toViews } from '../flag-view';
import { Box, SupplierRef, pgCode, resolveSupplier } from './orders';

const DAY = 86_400_000;
type FlagRow = typeof S.flags.$inferSelect;
const LIVE = ['proposed', 'open', 'disputed'];
/** issue = unresolved delivery flags; correct = confirmed, or nothing wrong and the invoice already matched; else waiting for the invoice. */
const stateOf = (d: { ownerMarkedCorrect: boolean; invoiceId: string | null }, flags: FlagRow[]) =>
  flags.some(f => LIVE.includes(f.status) && !f.supersededBy) ? 'issue' : flags.some(f => f.supersededBy) ? 'billed' : d.ownerMarkedCorrect || d.invoiceId ? 'correct' : 'waiting';

export function deliveriesRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/deliveries', '/delivery-suggestions'], requireAuth);

  r.post('/deliveries', requireCan('correct_extraction'), async (req, res) => {
    const body = SupplierRef.extend({
      poId: z.string().nullish(), documentId: z.string().optional(), doNo: z.string().trim().min(1).max(60), docDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      lines: z.array(z.object({ description: z.string().trim().min(1), qty: z.number().int().min(0).max(100000), unit: z.string().trim().max(20).optional(), box: Box })).min(1).max(200),
    }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah', { issues: z.flattenError(body.error) });
    const b = body.data;
    let supId: string | undefined;
    const out = await db.transaction(async tx => {
      const supplierId = await resolveSupplier(tx, b, req.role!);
      supId = supplierId;
      const dups = await tx.select({ id: S.deliveries.id, no: S.deliveries.doNo }).from(S.deliveries).where(eq(S.deliveries.supplierId, supplierId));
      const dup = dups.find(d => d.no.trim().toLowerCase() === b.doNo.toLowerCase());
      if (dup) throw new ApiError(409, 'duplicate_delivery', 'Penghantaran ini sudah ada', { deliveryId: dup.id });
      let po: ReturnType<typeof poLineRowToCore>[] = [];
      if (b.poId) {
        const [p] = await tx.select({ supplierId: S.purchaseOrders.supplierId }).from(S.purchaseOrders).where(eq(S.purchaseOrders.id, b.poId));
        if (!p) throw new ApiError(404, 'not_found', 'PO tiada');
        if (p.supplierId !== supplierId) throw new ApiError(422, 'po_supplier_mismatch', 'PO bukan daripada pembekal ini');
        po = (await tx.select().from(S.poLines).where(eq(S.poLines.poId, b.poId))).map(poLineRowToCore);
      }
      if (b.documentId) {
        const [doc] = await tx.select().from(S.documents).where(eq(S.documents.id, b.documentId));
        const [taken] = await tx.select({ id: S.deliveries.id }).from(S.deliveries).where(eq(S.deliveries.documentId, b.documentId));
        if (!doc || doc.kind !== 'delivery_note' || doc.invoiceId || doc.deliveryId || taken) throw new ApiError(422, 'bad_document', 'Dokumen tidak sah');
      }
      const aliases = aliasTableFromRows(await tx.select().from(S.aliases).where(eq(S.aliases.supplierId, supplierId)));
      const id = `del_${nanoid(10)}`;
      await tx.insert(S.deliveries).values({ id, supplierId, poId: b.poId ?? null, documentId: b.documentId ?? null, doNo: b.doNo, docDate: b.docDate ?? null, receivedAt: new Date() });
      await tx.insert(S.deliveryLines).values(b.lines.map((l, i) => {
        const m = po.length ? matchLine(supplierId, { lineId: `L${i + 1}`, description: l.description, qty: l.qty, unitPriceSen: 0 }, po, aliases) : undefined;
        return { id: `${id}_L${i + 1}`, deliveryId: id, lineId: `L${i + 1}`, sku: m?.sku ?? null, description: l.description, qty: l.qty, unit: l.unit || null, box: (l.box ?? null) as S.Box | null, position: i };
      }));
      if (b.documentId) await tx.update(S.documents).set({ deliveryId: id }).where(eq(S.documents.id, b.documentId));
      await logEvent(tx, req.role!, 'delivery.create', id, { doNo: b.doNo });
      return { id };
    }).catch(e => {
      if (pgCode(e) === '23505') throw new ApiError(409, 'duplicate_delivery', 'Penghantaran ini sudah ada', { supplierId: supId });
      throw e;
    });
    res.status(201).json(out);
  });

  r.get('/deliveries', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const rows = await db.select({ d: S.deliveries, supplierName: S.suppliers.name }).from(S.deliveries).innerJoin(S.suppliers, eq(S.suppliers.id, S.deliveries.supplierId)).orderBy(desc(S.deliveries.receivedAt)).limit(limit);
    const flags = rows.length ? await db.select().from(S.flags).where(inArray(S.flags.deliveryId, rows.map(x => x.d.id))) : [];
    res.json({ deliveries: rows.map(x => ({ id: x.d.id, doNo: x.d.doNo, docDate: x.d.docDate, supplierId: x.d.supplierId, supplierName: x.supplierName, receivedAt: x.d.receivedAt.getTime(), invoiceId: x.d.invoiceId, state: stateOf(x.d, flags.filter(f => f.deliveryId === x.d.id)) })) });
  });

  r.get('/deliveries/:id', async (req, res) => {
    const c = await loadDeliveryContext(db, String(req.params.id));
    if (!c) throw new ApiError(404, 'not_found', 'Penghantaran tiada');
    const flagRows = await db.select().from(S.flags).where(eq(S.flags.deliveryId, c.del.id));
    const [sup] = await db.select({ name: S.suppliers.name }).from(S.suppliers).where(eq(S.suppliers.id, c.del.supplierId));
    const photos = await db.select({ id: S.documents.id, kind: S.documents.kind, photoKind: S.documents.photoKind }).from(S.documents).where(eq(S.documents.deliveryId, c.del.id));
    const [doc] = c.del.documentId ? await db.select().from(S.documents).where(eq(S.documents.id, c.del.documentId)) : [];
    const counts = { ...defaultDeliveryCounts(c), ...c.saved };
    const flags = await toViews(db, flagRows);
    res.json({
      delivery: { id: c.del.id, doNo: c.del.doNo, docDate: c.del.docDate, receivedAt: c.del.receivedAt.getTime(), supplierId: c.del.supplierId, supplierName: sup?.name ?? '', poId: c.del.poId, poNo: c.poRow?.poNo ?? null,
        invoiceId: c.del.invoiceId, ownerMarkedCorrect: c.del.ownerMarkedCorrect, state: stateOf(c.del, flagRows), documentId: c.del.documentId, hasCounts: Object.keys(c.saved).length > 0,
        doc: doc ? { id: doc.id, width: doc.width, height: doc.height } : null },
      lines: c.lines.map(l => ({ lineId: l.lineId, description: l.description, qty: l.qty, unit: l.unit, box: l.box, matchedSku: l.sku, receivedQty: counts[`line:${l.lineId}`] ?? l.qty })),
      flags, estimateSen: claimableSen(flags.filter(f => f.status === 'proposed' && !f.supersededBy)),
      photos: photos.filter(p => p.kind !== 'delivery_note' || p.id !== c.del.documentId).map(p => ({ id: p.id, kind: p.kind, photoKind: p.photoKind, url: `/api/documents/${p.id}/file` })),
    });
  });

  r.put('/deliveries/:id/counts', requireCan('record_count'), async (req, res) => {
    const body = z.object({ counts: z.record(z.string(), z.number().int().min(0).max(100000)).default({}) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Kiraan tidak sah');
    const id = String(req.params.id);
    if (Object.keys(body.data.counts).length > 500) throw new ApiError(400, 'bad_request', 'Terlalu banyak kiraan');
    const rows = await db.transaction(async tx => {
      await lockDelivery(tx, id);
      const c = await loadDeliveryContext(tx, id);
      if (!c) throw new ApiError(404, 'not_found', 'Penghantaran tiada');
      const allowed = new Set([...c.lines.map(l => `line:${l.lineId}`), ...c.po.map(p => p.sku)]);
      if (Object.keys(body.data.counts).some(k => !allowed.has(k))) throw new ApiError(400, 'bad_request', 'Kiraan tidak sah');
      const merged = { ...defaultDeliveryCounts(c), ...c.saved, ...body.data.counts };
      await tx.delete(S.deliveryCounts).where(eq(S.deliveryCounts.deliveryId, id));
      await tx.insert(S.deliveryCounts).values(Object.entries(merged).map(([key, qty]) => ({ deliveryId: id, key, qty, recordedByRole: req.role! })));
      const detected = runDeliveryCheck(c, merged);
      await replaceProposedDeliveryFlags(tx, c, detected);
      await logEvent(tx, req.role!, 'delivery.record_counts', id, { flags: detected.length });
      return await tx.select().from(S.flags).where(eq(S.flags.deliveryId, id));
    });
    const flags = await toViews(db, rows);
    res.json({ flags, estimateSen: claimableSen(flags.filter(f => f.status === 'proposed' && !f.supersededBy)) });
  });

  r.post('/deliveries/:id/mark-correct', requireCan('mark_correct'), async (req, res) => {
    const id = String(req.params.id);
    const [d] = await db.select().from(S.deliveries).where(eq(S.deliveries.id, id));
    if (!d) throw new ApiError(404, 'not_found', 'Penghantaran tiada');
    const fl = (await db.select().from(S.flags).where(eq(S.flags.deliveryId, id))).filter(f => !f.supersededBy);
    if (!canMarkCorrect(id, fl.map(f => flagRowToCore(f)))) throw new ApiError(409, 'unresolved_flags', 'Masih ada aduan belum selesai');
    await db.update(S.deliveries).set({ ownerMarkedCorrect: true }).where(eq(S.deliveries.id, id));
    await logEvent(db, req.role!, 'delivery.mark_correct', id);
    res.json({ ok: true });
  });

  /** Unlinked deliveries from the last 30 days: same PO first, then nearest in time. */
  r.post('/delivery-suggestions', async (req, res) => {
    const body = z.object({ supplierId: z.string().min(1), poId: z.string().nullish() }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const rows = await db.select().from(S.deliveries).where(and(eq(S.deliveries.supplierId, body.data.supplierId), isNull(S.deliveries.invoiceId), gte(S.deliveries.receivedAt, new Date(Date.now() - 30 * DAY))));
    const now = Date.now();
    rows.sort((a, b) => (Number(b.poId === body.data.poId && !!body.data.poId) - Number(a.poId === body.data.poId && !!body.data.poId)) || Math.abs(now - a.receivedAt.getTime()) - Math.abs(now - b.receivedAt.getTime()));
    res.json({ deliveries: rows.map(d => ({ id: d.id, doNo: d.doNo, docDate: d.docDate, receivedAt: d.receivedAt.getTime(), poId: d.poId, samePo: !!body.data.poId && d.poId === body.data.poId })) });
  });
  return r;
}
