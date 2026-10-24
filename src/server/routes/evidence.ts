// Public supplier-facing evidence (no session). Whitelist only: one flag's documents, plus sibling flags of the same message.
import { Router } from 'express';
import { and, eq, inArray, ne } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { buildEvidence, type PhotoKind } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { flagRowToCore, poLineRowToCore, ymd } from '../core-adapters';

const PHOTO_KIND: Record<string, PhotoKind> = { po: 'po', invoice: 'invoice', delivery_note: 'signed_bon' };

export function evidenceRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use(['/public', '/e'], (_req, res, next) => { res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' }); next(); });

  const flagByToken = async (token: string) => {
    const [row] = await db.select().from(S.flags).where(eq(S.flags.evidenceToken, token));
    if (!row || row.status === 'proposed' || row.status === 'dismissed') throw new ApiError(404, 'not_found', 'Tiada');
    return row;
  };

  r.get('/public/evidence/:token', async (req, res) => {
    const row = await flagByToken(String(req.params.token));
    const isDelivery = row.stage === 'delivery';
    // a delivery is shown as an invoice-shaped object (no prices, total 0) so buildEvidence stays the single whitelist
    let parent: { id: string; invoiceNo: string; totalSen: number; issuedAt: Date; docDate: string | null; documentId: string | null };
    let lines: { lineId: string; description: string; qty: number; unitPriceSen: number; box: S.Box | null; position: number }[];
    if (isDelivery) {
      const [d] = await db.select().from(S.deliveries).where(eq(S.deliveries.id, row.deliveryId!));
      if (!d) throw new ApiError(404, 'not_found', 'Tiada');
      parent = { id: d.id, invoiceNo: d.doNo, totalSen: 0, issuedAt: d.receivedAt, docDate: d.docDate, documentId: d.documentId };
      lines = (await db.select().from(S.deliveryLines).where(eq(S.deliveryLines.deliveryId, d.id)).orderBy(S.deliveryLines.position))
        .map(l => ({ lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: 0, box: l.box, position: l.position }));
    } else {
      const [i] = await db.select().from(S.invoices).where(eq(S.invoices.id, row.invoiceId!));
      if (!i) throw new ApiError(404, 'not_found', 'Tiada');
      parent = { id: i.id, invoiceNo: i.invoiceNo, totalSen: i.totalSen, issuedAt: i.issuedAt, docDate: i.docDate, documentId: i.documentId };
      lines = await db.select().from(S.invoiceLines).where(eq(S.invoiceLines.invoiceId, i.id)).orderBy(S.invoiceLines.position);
    }
    const [po] = row.poId ? await db.select().from(S.purchaseOrders).where(eq(S.purchaseOrders.id, row.poId)) : [];
    const poLines = po ? await db.select().from(S.poLines).where(eq(S.poLines.poId, po.id)).orderBy(S.poLines.position) : [];
    const photoRows = await db.select({ d: S.documents }).from(S.flagPhotos).innerJoin(S.documents, eq(S.documents.id, S.flagPhotos.documentId)).where(eq(S.flagPhotos.flagId, row.id));
    const token = row.evidenceToken;
    const photos = photoRows.map(p => ({ id: p.d.id, kind: (p.d.photoKind as PhotoKind | null) ?? PHOTO_KIND[p.d.kind] ?? 'delivery', url: `/api/public/evidence/${token}/photo/${p.d.id}` }));
    const payload = buildEvidence({
      flags: [flagRowToCore(row, photos.map(p => p.id))],
      invoices: [{ id: parent.id, supplierId: row.supplierId, poId: row.poId ?? '', invoiceNo: parent.invoiceNo, totalSen: parent.totalSen, issuedAt: parent.issuedAt.getTime(),
        payment: 'on_credit', lines: lines.map(l => ({ lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: l.unitPriceSen, box: (l.box ?? undefined) as [number, number, number, number] | undefined })) }],
      pos: po ? [{ id: po.id, poNo: po.poNo, supplierId: po.supplierId, lines: poLines.map(poLineRowToCore) }] : [],
      photos,
    }, row.id);
    // siblings: same invoice/delivery, same message (same sentAt), visible statuses only; four fields, nothing else
    const sameParent = isDelivery ? eq(S.flags.deliveryId, row.deliveryId!) : eq(S.flags.invoiceId, row.invoiceId!);
    const sibRows = row.sentAt ? await db.select().from(S.flags).where(and(sameParent, ne(S.flags.id, row.id), inArray(S.flags.status, ['open', 'disputed', 'settled']))) : [];
    const siblings = sibRows.filter(s => s.sentAt?.getTime() === row.sentAt!.getTime())
      .map(s => ({ type: s.type, description: lines.find(l => l.lineId === s.invoiceLineId)?.description ?? '', amountSen: s.amountSen, status: s.status }));
    const [shop] = await db.select().from(S.settings).where(eq(S.settings.key, 'shop'));
    const [idoc] = parent.documentId ? await db.select({ width: S.documents.width, height: S.documents.height }).from(S.documents).where(eq(S.documents.id, parent.documentId)) : [];
    const [sup] = await db.select({ name: S.suppliers.name }).from(S.suppliers).where(eq(S.suppliers.id, row.supplierId));
    res.json({ ...payload, missingQty: row.type === 'short_qty' ? row.missingQty : null, siblings, stage: row.stage, shopName: (shop?.value as { name?: string } | undefined)?.name ?? '', supplierName: sup?.name ?? '',
      invoiceDocDate: parent.docDate ?? ymd(parent.issuedAt), invoiceDoc: idoc ? { width: idoc.width, height: idoc.height } : null });
  });

  r.get('/public/evidence/:token/photo/:documentId', async (req, res) => {
    const row = await flagByToken(String(req.params.token));
    const [link] = await db.select().from(S.flagPhotos).where(and(eq(S.flagPhotos.flagId, row.id), eq(S.flagPhotos.documentId, String(req.params.documentId))));
    if (!link) throw new ApiError(404, 'not_found', 'Tiada');
    const [doc] = await db.select().from(S.documents).where(eq(S.documents.id, link.documentId));
    const stream = doc ? await deps.storage.stream(doc.storageKey) : null;
    if (!doc || !stream) throw new ApiError(404, 'not_found', 'Tiada');
    res.set({ 'Content-Type': doc.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
  return r;
}
