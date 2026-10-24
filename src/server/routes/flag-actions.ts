import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { acceptPrice, autofillPriceList, learnAlias, matchLine, normalise, setAgreedPrice, transition, type FlagType } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { cleanPriceList, flagCoreToPatch, flagRowToCore } from '../core-adapters';
import { defaultCounts, loadContext, replaceProposedFlags, runDetection, snapshotOf } from '../flags';
import { defaultDeliveryCounts, loadDeliveryContext } from '../delivery-ctx';
import { lockInvoice, requestsFor, updateFlagAtomic } from '../flag-ops';
import { toViews } from '../flag-view';

export { REQUESTS } from '../flag-ops';
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
    const [sup] = await db.select({ policyNote: S.suppliers.policyNote }).from(S.suppliers).where(eq(S.suppliers.id, row.supplierId));
    const evs = await db.select().from(S.events).where(eq(S.events.ref, row.id)).orderBy(S.events.at);
    const photoRows = await db.select({ d: S.documents }).from(S.flagPhotos).innerJoin(S.documents, eq(S.documents.id, S.flagPhotos.documentId)).where(eq(S.flagPhotos.flagId, row.id));
    const common = {
      policyNote: sup?.policyNote ?? null,
      events: evs.map(e => ({ id: e.id, at: e.at.getTime(), role: e.role, action: e.action, meta: e.meta })),
      flag: view, evidenceToken: req.role === 'owner' ? row.evidenceToken : undefined,
      allowedRequests: requestsFor(row),
      photos: photoRows.map(p => ({ id: p.d.id, kind: p.d.photoKind ?? PHOTO_KIND[p.d.kind] ?? 'delivery', url: `/api/documents/${p.d.id}/file` })),
    };
    if (row.stage === 'delivery') {
      const c = await loadDeliveryContext(db, row.deliveryId!);
      const line = c?.lines.find(l => l.lineId === row.invoiceLineId);
      const [doc] = c?.del.documentId ? await db.select().from(S.documents).where(eq(S.documents.id, c.del.documentId)) : [];
      const counts = c ? { ...defaultDeliveryCounts(c), ...c.saved } : {};
      res.json({
        ...common,
        line: line ? { lineId: line.lineId, description: line.description, qty: line.qty, unit: line.unit, unitPriceSen: row.baselineUnitSen ?? 0, box: line.box } : null,
        receivedQty: line ? counts[`line:${line.lineId}`] ?? null : null,
        invoiceDoc: doc ? { id: doc.id, width: doc.width, height: doc.height } : null,
        substituteFor: null, poOptions: [],
        delivery: c ? { id: c.del.id, doNo: c.del.doNo, invoiceId: c.del.invoiceId } : null,
      });
      return;
    }
    const c = await loadContext(db, row.invoiceId!);
    const line = c?.lines.find(l => l.lineId === row.invoiceLineId);
    const [doc] = c?.inv.documentId ? await db.select().from(S.documents).where(eq(S.documents.id, c.inv.documentId)) : [];
    const counts = c ? { ...defaultCounts(c), ...c.saved } : {};
    const subFor = row.possibleSubstituteFor ? c?.po.find(p => p.sku === row.possibleSubstituteFor) : undefined;
    const poOnly = c && !c.implicitPo ? c.po.filter(p => !c.invLines.some(l => matchLine(c.inv.supplierId, l, c.po, c.aliases)?.sku === p.sku)) : [];
    res.json({
      ...common,
      line: line ? { lineId: line.lineId, description: line.description, qty: line.qty, unit: line.unit, unitPriceSen: line.unitPriceSen, box: line.box } : null,
      receivedQty: line ? counts[`line:${line.lineId}`] ?? null : null,
      invoiceDoc: doc ? { id: doc.id, width: doc.width, height: doc.height } : null,
      substituteFor: subFor ? { sku: subFor.sku, description: subFor.description } : null,
      poOptions: poOnly.map(p => ({ sku: p.sku, description: p.description, orderedQty: p.orderedQty })),
      delivery: null,
    });
  });

  r.post('/flags/:id/approve', requireCan('approve_flag'), async (req, res) => {
    const body = z.object({ request: z.enum(['send_missing', 'deduct', 'collect_back', 'agreed_price']).optional() }).safeParse(req.body ?? {});
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const row = await load(String(req.params.id));
    needProposed(row.status);
    const allowed = requestsFor(row);
    if (row.type === 'price_change' && row.direction === 'down') throw new ApiError(422, 'not_claimable', 'Harga turun: hanya boleh diabaikan');
    // a price reference that is only history (PO / previous invoice) is not an agreement: default to deducting the difference, not "charge the agreed price"
    const request = body.data.request ?? (row.type === 'price_change' && row.baselineSource !== null && row.baselineSource !== 'agreed' && allowed.includes('deduct') ? 'deduct' : allowed[0]);
    if (!allowed.includes(request)) throw new ApiError(422, 'bad_request', 'Permintaan tidak sesuai');
    const next = { ...transition(flagRowToCore(row), 'open', Date.now()), request };
    const out = await db.transaction(async tx => {
      const o = await updateFlagAtomic(tx, row, flagCoreToPatch(next));
      await logEvent(tx, req.role!, 'flag.approve', row.id, { request });
      return o;
    });
    res.json({ flag: (await toViews(db, [out]))[0] });
  });

  r.post('/flags/:id/dismiss', requireCan('dismiss_flag'), async (req, res) => {
    const body = z.object({ asInflation: z.boolean().optional() }).safeParse(req.body ?? {});
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const row = await load(String(req.params.id));
    needProposed(row.status);
    const accepted = row.direction === 'down' ? 'down' as const : undefined;
    const asInflation = (!!body.data.asInflation || !!accepted) && row.type === 'price_change' && (row.direction === 'up' || row.direction === 'down') && !!row.sku && row.invoiceUnitSen !== null && !!row.invoiceId;
    const next = transition(flagRowToCore(row), 'dismissed', Date.now());
    const out = await db.transaction(async tx => {
      const o = await updateFlagAtomic(tx, row, flagCoreToPatch(next));
      // "Ini kenaikan biasa": the new price becomes the last-invoice baseline (core autofill rule)
      if (asInflation) {
        const c = await loadContext(tx, row.invoiceId!);
        if (c) {
          const next2 = cleanPriceList(acceptPrice(c.priceNow, row.sku!, row.invoiceUnitSen!))[row.sku!];
          await tx.insert(S.priceList).values({ supplierId: c.inv.supplierId, sku: row.sku!, agreedSen: next2?.agreedSen, lastInvoiceSen: next2?.lastInvoiceSen ?? row.invoiceUnitSen })
            .onConflictDoUpdate({ target: [S.priceList.supplierId, S.priceList.sku], set: { agreedSen: next2?.agreedSen, lastInvoiceSen: next2?.lastInvoiceSen ?? row.invoiceUnitSen } });
        }
      }
      await logEvent(tx, req.role!, 'flag.dismiss', row.id, accepted ? { asInflation, accepted } : { asInflation });
      return o;
    });
    res.json({ flag: (await toViews(db, [out]))[0] });
  });

  r.post('/flags/:id/report-price', requireCan('set_agreed_price'), async (req, res) => {
    const body = z.object({ agreedSen: z.number().int().nonnegative() }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Harga tidak sah');
    const row = await load(String(req.params.id));
    needProposed(row.status);
    if (row.type !== 'price_change' || !row.sku || !row.invoiceId) throw new ApiError(422, 'bad_request', 'Hanya untuk perubahan harga');
    const result = await db.transaction(async tx => {
      await lockInvoice(tx, row.invoiceId!);
      const c = await loadContext(tx, row.invoiceId!);
      if (!c) throw new ApiError(404, 'not_found', 'Invois tiada');
      const snapshot = cleanPriceList(setAgreedPrice(snapshotOf(c), row.sku!, body.data.agreedSen));
      await tx.update(S.invoices).set({ priceListSnapshot: snapshot }).where(eq(S.invoices.id, c.inv.id));
      await tx.insert(S.priceList).values({ supplierId: c.inv.supplierId, sku: row.sku!, agreedSen: body.data.agreedSen })
        .onConflictDoUpdate({ target: [S.priceList.supplierId, S.priceList.sku], set: { agreedSen: body.data.agreedSen } });
      const detected = runDetection(c, { ...defaultCounts(c), ...c.saved }, snapshot).find(d => d.type === 'price_change' && d.invoiceLineId === row.invoiceLineId);
      if (!detected || detected.amountSen === 0) {
        const o = await updateFlagAtomic(tx, row, flagCoreToPatch(transition(flagRowToCore(row), 'dismissed', Date.now())));
        await logEvent(tx, req.role!, 'flag.report_price', row.id, { agreedSen: body.data.agreedSen, dismissed: true });
        return { o, dismissed: true };
      }
      const opened = { ...transition(flagRowToCore(row), 'open', Date.now()), request: 'agreed_price' as const };
      const o = await updateFlagAtomic(tx, row, {
        ...flagCoreToPatch(opened), amountSen: detected.amountSen, baselineUnitSen: detected.baselineUnitSen ?? null, baselineSource: detected.baselineSource ?? null,
        direction: detected.direction ?? null, pricedQty: detected.pricedQty ?? null, invoiceUnitSen: detected.invoiceUnitSen ?? null,
      });
      await logEvent(tx, req.role!, 'flag.report_price', row.id, { agreedSen: body.data.agreedSen, dismissed: false });
      return { o, dismissed: false };
    });
    res.json({ flag: (await toViews(db, [result.o]))[0], dismissed: result.dismissed });
  });

  r.post('/flags/:id/link-substitute', requireCan('approve_flag'), async (req, res) => {
    const body = z.object({ sku: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const row = await load(String(req.params.id));
    needProposed(row.status);
    if (row.type !== 'not_ordered' || row.stage !== 'invoice' || !row.invoiceId) throw new ApiError(422, 'bad_request', 'Hanya untuk barang tidak dipesan pada invois');
    const out = await db.transaction(async tx => {
      await lockInvoice(tx, row.invoiceId!);
      const [fresh] = await tx.select({ status: S.flags.status }).from(S.flags).where(eq(S.flags.id, row.id));
      if (!fresh || fresh.status !== 'proposed') throw new ApiError(409, 'bad_state', 'Aduan ini sudah diproses');
      const c = await loadContext(tx, row.invoiceId!);
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
      await tx.insert(S.receivedCounts).values({ invoiceId: c.inv.id, key: `line:${line.lineId}`, qty: counts[`line:${line.lineId}`], source: c.savedSources[`line:${line.lineId}`] ?? 'default', recordedByRole: req.role! });
      await replaceProposedFlags(tx, c, runDetection(c, counts, snapshotOf(c)));
      await logEvent(tx, req.role!, 'flag.link_substitute', row.id, { sku: body.data.sku });
      return await tx.select().from(S.flags).where(eq(S.flags.invoiceId, c.inv.id));
    });
    res.json({ flags: await toViews(db, out) });
  });
  return r;
}
