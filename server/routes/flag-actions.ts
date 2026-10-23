import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { learnAlias, matchLine, normalise, setAgreedPrice, transition, type FlagRequest, type FlagType } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { cleanPriceList, flagCoreToPatch, flagRowToCore } from '../core-adapters';
import { defaultCounts, loadContext, replaceProposedFlags, runDetection, snapshotOf } from '../flags';
import { toViews } from '../flag-view';

/** Notes 25: allowed requests per type, first is the default. */
export const REQUESTS: Record<FlagType, FlagRequest[]> = {
  short_qty: ['deduct', 'send_missing'],
  price_change: ['agreed_price', 'deduct'],
  not_ordered: ['collect_back', 'deduct'],
};
const PHOTO_KIND: Record<string, string> = { po: 'po', invoice: 'invoice', delivery_note: 'signed_bon' };

export function flagActionsRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use('/flags', requireAuth);

  const load = async (id: string) => {
    const [row] = await db.select().from(S.flags).where(eq(S.flags.id, id));
    if (!row) throw new ApiError(404, 'not_found', 'Aduan tiada');
    return row;
  };
  const needProposed = (status: string) => { if (status !== 'proposed') throw new ApiError(409, 'bad_state', 'Aduan ini sudah diproses'); };

  r.get('/flags/:id', async (req, res) => {
    const row = await load(String(req.params.id));
    const [view] = await toViews(db, [row]);
    const c = await loadContext(db, row.invoiceId);
    const line = c?.lines.find(l => l.lineId === row.invoiceLineId);
    const [doc] = c?.inv.documentId ? await db.select().from(S.documents).where(eq(S.documents.id, c.inv.documentId)) : [];
    const photoRows = await db.select({ d: S.documents }).from(S.flagPhotos).innerJoin(S.documents, eq(S.documents.id, S.flagPhotos.documentId)).where(eq(S.flagPhotos.flagId, row.id));
    const counts = c ? { ...defaultCounts(c), ...c.saved } : {};
    const subFor = row.possibleSubstituteFor ? c?.po.find(p => p.sku === row.possibleSubstituteFor) : undefined;
    const poOnly = c && !c.implicitPo ? c.po.filter(p => !c.invLines.some(l => matchLine(c.inv.supplierId, l, c.po, c.aliases)?.sku === p.sku)) : [];
    const [sup] = await db.select({ policyNote: S.suppliers.policyNote }).from(S.suppliers).where(eq(S.suppliers.id, row.supplierId));
    const evs = await db.select().from(S.events).where(eq(S.events.ref, row.id)).orderBy(S.events.at);
    res.json({
      policyNote: sup?.policyNote ?? null,
      events: evs.map(e => ({ id: e.id, at: e.at.getTime(), role: e.role, action: e.action })),
      flag: view, evidenceToken: req.role === 'owner' ? row.evidenceToken : undefined,
      line: line ? { lineId: line.lineId, description: line.description, qty: line.qty, unit: line.unit, unitPriceSen: line.unitPriceSen, box: line.box } : null,
      receivedQty: line ? counts[`line:${line.lineId}`] ?? null : null,
      invoiceDoc: doc ? { id: doc.id, width: doc.width, height: doc.height } : null,
      substituteFor: subFor ? { sku: subFor.sku, description: subFor.description } : null,
      poOptions: poOnly.map(p => ({ sku: p.sku, description: p.description, orderedQty: p.orderedQty })),
      allowedRequests: REQUESTS[row.type as FlagType],
      photos: photoRows.map(p => ({ id: p.d.id, kind: p.d.photoKind ?? PHOTO_KIND[p.d.kind] ?? 'delivery', url: `/api/documents/${p.d.id}/file` })),
    });
  });

  r.post('/flags/:id/approve', requireCan('approve_flag'), async (req, res) => {
    const body = z.object({ request: z.enum(['send_missing', 'deduct', 'collect_back', 'agreed_price']).optional() }).safeParse(req.body ?? {});
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const row = await load(String(req.params.id));
    needProposed(row.status);
    const allowed = REQUESTS[row.type as FlagType];
    if (row.type === 'price_change' && row.direction === 'down') throw new ApiError(422, 'not_claimable', 'Harga turun: hanya boleh diabaikan');
    const request = body.data.request ?? allowed[0];
    if (!allowed.includes(request)) throw new ApiError(422, 'bad_request', 'Permintaan tidak sesuai');
    const next = { ...transition(flagRowToCore(row), 'open', Date.now()), request };
    const [out] = await db.update(S.flags).set(flagCoreToPatch(next)).where(eq(S.flags.id, row.id)).returning();
    await logEvent(db, req.role!, 'flag.approve', row.id, { request });
    res.json({ flag: (await toViews(db, [out]))[0] });
  });

  r.post('/flags/:id/dismiss', requireCan('dismiss_flag'), async (req, res) => {
    const row = await load(String(req.params.id));
    needProposed(row.status);
    const next = transition(flagRowToCore(row), 'dismissed', Date.now());
    const [out] = await db.update(S.flags).set(flagCoreToPatch(next)).where(eq(S.flags.id, row.id)).returning();
    // dismissing a price change = "normal inflation": the new price becomes the last-invoice baseline (core autofill rule without skip)
    if (row.type === 'price_change' && row.sku && row.invoiceUnitSen !== null) {
      const [inv] = await db.select({ supplierId: S.invoices.supplierId }).from(S.invoices).where(eq(S.invoices.id, row.invoiceId));
      await db.insert(S.priceList).values({ supplierId: inv.supplierId, sku: row.sku, lastInvoiceSen: row.invoiceUnitSen })
        .onConflictDoUpdate({ target: [S.priceList.supplierId, S.priceList.sku], set: { lastInvoiceSen: row.invoiceUnitSen } });
    }
    await logEvent(db, req.role!, 'flag.dismiss', row.id);
    res.json({ flag: (await toViews(db, [out]))[0] });
  });

  r.post('/flags/:id/report-price', requireCan('set_agreed_price'), async (req, res) => {
    const body = z.object({ agreedSen: z.number().int().nonnegative() }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Harga tidak sah');
    const row = await load(String(req.params.id));
    needProposed(row.status);
    if (row.type !== 'price_change' || !row.sku) throw new ApiError(422, 'bad_request', 'Hanya untuk perubahan harga');
    const result = await db.transaction(async tx => {
      const c = await loadContext(tx, row.invoiceId);
      if (!c) throw new ApiError(404, 'not_found', 'Invois tiada');
      const snapshot = cleanPriceList(setAgreedPrice(snapshotOf(c), row.sku!, body.data.agreedSen));
      await tx.update(S.invoices).set({ priceListSnapshot: snapshot }).where(eq(S.invoices.id, c.inv.id));
      await tx.insert(S.priceList).values({ supplierId: c.inv.supplierId, sku: row.sku!, agreedSen: body.data.agreedSen })
        .onConflictDoUpdate({ target: [S.priceList.supplierId, S.priceList.sku], set: { agreedSen: body.data.agreedSen } });
      const detected = runDetection(c, { ...defaultCounts(c), ...c.saved }, snapshot).find(d => d.type === 'price_change' && d.invoiceLineId === row.invoiceLineId);
      if (!detected || detected.amountSen === 0) {
        const [o] = await tx.update(S.flags).set(flagCoreToPatch(transition(flagRowToCore(row), 'dismissed', Date.now()))).where(eq(S.flags.id, row.id)).returning();
        return o;
      }
      const opened = { ...transition(flagRowToCore(row), 'open', Date.now()), request: 'agreed_price' as const };
      const [o] = await tx.update(S.flags).set({
        ...flagCoreToPatch(opened), amountSen: detected.amountSen, baselineUnitSen: detected.baselineUnitSen ?? null, baselineSource: detected.baselineSource ?? null,
        direction: detected.direction ?? null, pricedQty: detected.pricedQty ?? null, invoiceUnitSen: detected.invoiceUnitSen ?? null,
      }).where(eq(S.flags.id, row.id)).returning();
      return o;
    });
    await logEvent(db, req.role!, 'flag.report_price', row.id, { agreedSen: body.data.agreedSen });
    res.json({ flag: (await toViews(db, [result]))[0] });
  });

  r.post('/flags/:id/link-substitute', requireCan('approve_flag'), async (req, res) => {
    const body = z.object({ sku: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const row = await load(String(req.params.id));
    needProposed(row.status);
    if (row.type !== 'not_ordered') throw new ApiError(422, 'bad_request', 'Hanya untuk barang tidak dipesan');
    const out = await db.transaction(async tx => {
      const c = await loadContext(tx, row.invoiceId);
      if (!c) throw new ApiError(404, 'not_found', 'Invois tiada');
      const line = c.lines.find(l => l.lineId === row.invoiceLineId);
      const target = c.po.find(p => p.sku === body.data.sku);
      if (!line || !target || c.implicitPo) throw new ApiError(422, 'bad_request', 'Padanan tidak sah');
      const table = learnAlias({}, c.inv.supplierId, line.description, target.sku);
      await tx.insert(S.aliases).values({ supplierId: c.inv.supplierId, normalisedDesc: normalise(line.description), sku: target.sku })
        .onConflictDoUpdate({ target: [S.aliases.supplierId, S.aliases.normalisedDesc], set: { sku: table[c.inv.supplierId][normalise(line.description)] } });
      c.aliases = { ...c.aliases, ...table, [c.inv.supplierId]: { ...(c.aliases[c.inv.supplierId] ?? {}), ...table[c.inv.supplierId] } };
      // the count follows the line
      const counts = { ...defaultCounts(c), ...c.saved };
      counts[`line:${line.lineId}`] = c.saved[`line:${line.lineId}`] ?? line.qty; // once matched, an uncounted line defaults to its billed qty (notes 13)
      delete counts[target.sku];
      await tx.delete(S.receivedCounts).where(and(eq(S.receivedCounts.invoiceId, c.inv.id), inArray(S.receivedCounts.key, [`line:${line.lineId}`, target.sku])));
      await tx.insert(S.receivedCounts).values({ invoiceId: c.inv.id, key: `line:${line.lineId}`, qty: counts[`line:${line.lineId}`], recordedByRole: req.role! });
      await replaceProposedFlags(tx, c, runDetection(c, counts, snapshotOf(c)));
      return await tx.select().from(S.flags).where(eq(S.flags.invoiceId, c.inv.id));
    });
    await logEvent(db, req.role!, 'flag.link_substitute', row.id, { sku: body.data.sku });
    res.json({ flags: await toViews(db, out) });
  });
  return r;
}
