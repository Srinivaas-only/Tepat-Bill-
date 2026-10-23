import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { matchLine } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { cleanPriceList } from '../core-adapters';
import { defaultCounts, firstSaveAutofill, loadContext, replaceProposedFlags, attachPhotos, runDetection, snapshotOf } from '../flags';
import { toViews } from '../flag-view';

export function countsRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/invoices', '/flags'], requireAuth);

  /** Attach an already-uploaded delivery-note document (bon from /scan) to an invoice as the signed bon. */
  r.post('/documents/:id/attach', requireAuth, requireCan('upload_document'), async (req, res) => {
    const body = z.object({ invoiceId: z.string(), photoKind: z.enum(['signed_bon', 'delivery']).default('signed_bon') }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const [inv] = await db.select({ id: S.invoices.id }).from(S.invoices).where(eq(S.invoices.id, body.data.invoiceId));
    if (!inv) throw new ApiError(404, 'not_found', 'Invois tiada');
    const [doc] = await db.select().from(S.documents).where(eq(S.documents.id, String(req.params.id)));
    if (!doc) throw new ApiError(404, 'not_found', 'Dokumen tiada');
    // only bon/photo uploads, and never one already tied to a different invoice (would leak across suppliers via evidence links)
    if (!['delivery_note', 'photo'].includes(doc.kind) || (doc.invoiceId && doc.invoiceId !== inv.id)) throw new ApiError(409, 'bad_document', 'Dokumen ini tidak boleh dilampirkan');
    const [d] = await db.update(S.documents).set({ invoiceId: inv.id, photoKind: body.data.photoKind }).where(eq(S.documents.id, doc.id)).returning({ id: S.documents.id });
    const c = await loadContext(db, inv.id);
    if (c) await attachPhotos(db, c);
    await logEvent(db, req.role!, 'document.attach', d.id, { invoiceId: inv.id });
    res.json({ ok: true, invoiceId: inv.id });
  });

  r.get('/invoices/:id', async (req, res) => {
    const c = await loadContext(db, String(req.params.id));
    if (!c) throw new ApiError(404, 'not_found', 'Invois tiada');
    const [sup] = await db.select().from(S.suppliers).where(eq(S.suppliers.id, c.inv.supplierId));
    const [doc] = c.inv.documentId ? await db.select().from(S.documents).where(eq(S.documents.id, c.inv.documentId)) : [];
    const photos = await db.select({ id: S.documents.id, photoKind: S.documents.photoKind, kind: S.documents.kind }).from(S.documents)
      .where(and(eq(S.documents.invoiceId, c.inv.id)));
    const matchedSkus = new Set<string>();
    const lines = c.lines.map(l => {
      const m = matchLine(c.inv.supplierId, { lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: l.unitPriceSen }, c.po, c.aliases);
      if (m) matchedSkus.add(m.sku);
      return { lineId: l.lineId, description: l.description, qty: l.qty, unit: l.unit, unitPriceSen: l.unitPriceSen, unitPriceForeignMinor: l.unitPriceForeignMinor, box: l.box, matchedSku: m?.sku ?? null };
    });
    const poOnly = c.implicitPo ? [] : c.po.filter(p => !matchedSkus.has(p.sku)).map(p => ({ sku: p.sku, description: p.description, orderedQty: p.orderedQty }));
    const flags = await toViews(db, await db.select().from(S.flags).where(eq(S.flags.invoiceId, c.inv.id)));
    res.json({
      invoice: {
        id: c.inv.id, invoiceNo: c.inv.invoiceNo, supplierId: c.inv.supplierId, supplierName: sup?.name ?? '', poId: c.inv.poId, poNo: c.poRow?.poNo ?? null,
        currency: c.inv.currency, totalSen: c.inv.totalSen, docDate: c.inv.docDate, issuedAt: c.inv.issuedAt.getTime(), dueAt: c.inv.dueAt.getTime(), payment: c.inv.payment,
        documentId: c.inv.documentId, doc: doc ? { width: doc.width, height: doc.height } : null,
      },
      lines, poOnly, counts: { ...defaultCounts(c), ...c.saved }, hasCounts: Object.keys(c.saved).length > 0, photos, flags,
    });
  });

  r.put('/invoices/:id/counts', requireCan('record_count'), async (req, res) => {
    const body = z.object({ counts: z.record(z.string(), z.number().int().min(0).max(100000)).default({}) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Kiraan tidak sah');
    const id = String(req.params.id);
    const out = await db.transaction(async tx => {
      const c = await loadContext(tx, id);
      if (!c) throw new ApiError(404, 'not_found', 'Invois tiada');
      const first = c.inv.priceListSnapshot === null;
      const snapshot = snapshotOf(c);
      const merged = { ...defaultCounts(c), ...c.saved, ...body.data.counts };
      const detected = runDetection(c, merged, snapshot);
      if (first) {
        await tx.update(S.invoices).set({ priceListSnapshot: cleanPriceList(snapshot) }).where(eq(S.invoices.id, id));
        await firstSaveAutofill(tx, c, detected);
      }
      await tx.delete(S.receivedCounts).where(eq(S.receivedCounts.invoiceId, id));
      await tx.insert(S.receivedCounts).values(Object.entries(merged).map(([key, qty]) => ({ invoiceId: id, key, qty, recordedByRole: req.role! })));
      await replaceProposedFlags(tx, c, detected);
      await logEvent(tx, req.role!, 'delivery.record_counts', id, { flags: detected.length });
      return await tx.select().from(S.flags).where(eq(S.flags.invoiceId, id));
    });
    const flags = await toViews(db, out);
    // claimable = everything except price decreases (those are good news, nothing to claim)
    const totalSen = flags.filter(f => f.status === 'proposed' && !(f.type === 'price_change' && f.direction === 'down')).reduce((a, f) => a + f.amountSen, 0);
    res.json({ flags, totalSen });
  });

  r.get('/flags', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status.split(',') : undefined;
    const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;
    const rows = await db.select().from(S.flags).where(and(status ? inArray(S.flags.status, status) : undefined, supplierId ? eq(S.flags.supplierId, supplierId) : undefined)).orderBy(desc(S.flags.createdAt));
    res.json({ flags: await toViews(db, rows) });
  });
  return r;
}
