import { Router } from 'express';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { draftMessage, markSent, waLink, type FlagType, type MessageLine } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { dmy, flagCoreToPatch, flagRowToCore } from '../core-adapters';
import { loadContext } from '../flags';
import { loadDeliveryContext } from '../delivery-ctx';
import { requestsFor } from '../flag-ops';

const ORDER: Record<string, number> = { short_qty: 0, price_change: 1, not_ordered: 2 };
type FlagRow = typeof S.flags.$inferSelect;
interface Parent { refNo: string; refDate: string; poNo?: string; lines: { lineId: string; description: string; qty: number; unitPriceSen: number; position: number }[]; siblings: FlagRow[] }

export function messagesRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use('/flags', requireAuth);

  /** The invoice or delivery a flag belongs to: its reference, date, lines and every flag raised on it. */
  const parentOf = async (flag: FlagRow): Promise<Parent> => {
    if (flag.stage === 'delivery') {
      const c = flag.deliveryId ? await loadDeliveryContext(db, flag.deliveryId) : null;
      if (!c) throw new ApiError(404, 'not_found', 'Penghantaran tiada');
      const siblings = await db.select().from(S.flags).where(eq(S.flags.deliveryId, c.del.id));
      return { refNo: c.del.doNo, refDate: c.del.docDate ? c.del.docDate.split('-').reverse().join('/') : dmy(c.del.receivedAt), poNo: c.poRow?.poNo,
        lines: c.lines.map(l => ({ lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: flag.baselineUnitSen ?? 0, position: l.position })), siblings };
    }
    const c = flag.invoiceId ? await loadContext(db, flag.invoiceId) : null;
    if (!c) throw new ApiError(404, 'not_found', 'Invois tiada');
    const siblings = await db.select().from(S.flags).where(eq(S.flags.invoiceId, c.inv.id));
    return { refNo: c.inv.invoiceNo, refDate: c.inv.docDate ? c.inv.docDate.split('-').reverse().join('/') : dmy(c.inv.issuedAt), poNo: c.poRow?.poNo,
      lines: c.lines.map(l => ({ lineId: l.lineId, description: l.description, qty: l.qty, unitPriceSen: l.unitPriceSen, position: l.position })), siblings };
  };

  /** Drafting never writes: reminders are logged when the owner actually taps send (POST /flags/sent). */
  r.get('/flags/:id/message', requireCan('send_message'), async (req, res) => {
    const lang = req.query.lang === 'en' ? 'en' : 'ms';
    const reminder = req.query.reminder === '1';
    const [flag] = await db.select().from(S.flags).where(eq(S.flags.id, String(req.params.id)));
    if (!flag) throw new ApiError(404, 'not_found', 'Aduan tiada');
    if (flag.status !== 'open' && flag.status !== 'disputed') throw new ApiError(409, 'bad_state', 'Aduan ini belum boleh dihantar');
    if (flag.supersededBy) throw new ApiError(409, 'superseded', 'Aduan ini sudah dibawa ke invois');
    const p = await parentOf(flag);
    const live = p.siblings.filter(s => !s.supersededBy);
    const group = reminder
      ? live.filter(s => s.id === flag.id || (flag.sentAt && s.sentAt?.getTime() === flag.sentAt.getTime() && (s.status === 'open' || s.status === 'disputed')))
      : live.filter(s => s.id === flag.id || (s.status === 'open' && !s.sentAt));
    const pos = (id: string) => p.lines.find(l => l.lineId === id)?.position ?? 0;
    group.sort((a, b) => pos(a.invoiceLineId) - pos(b.invoiceLineId) || ORDER[a.type] - ORDER[b.type]);
    const lines: MessageLine[] = group.map(g => {
      const l = p.lines.find(x => x.lineId === g.invoiceLineId)!;
      const base = { type: g.type as FlagType, item: l.description, amountSen: g.amountSen, request: (g.request ?? requestsFor(g)[0]) as MessageLine['request'] };
      if (g.type === 'short_qty') return { ...base, billedQty: l.qty, receivedQty: l.qty - (g.missingQty ?? 0), missingQty: g.missingQty ?? 0 };
      if (g.type === 'price_change') return { ...base, invoiceUnitSen: g.invoiceUnitSen ?? l.unitPriceSen, agreedUnitSen: g.baselineUnitSen ?? 0, pricedQty: g.pricedQty ?? 0 };
      return { ...base, qty: l.qty };
    });
    const [sup] = await db.select().from(S.suppliers).where(eq(S.suppliers.id, flag.supplierId));
    const [shop] = await db.select().from(S.settings).where(eq(S.settings.key, 'shop'));
    const base = process.env.PUBLIC_BASE_URL?.trim();
    const origin = base && /^https:\/\//.test(base) && !(process.env.NODE_ENV === 'production' && base.includes('.replit.dev'))
      ? base.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;
    const evidenceUrl = `${origin}/e/${group[0].evidenceToken}`;
    const text = draftMessage({
      lang, shopName: (shop?.value as { name?: string } | undefined)?.name ?? 'Kedai', supplierName: sup?.name ?? '', invoiceNo: p.refNo,
      invoiceDate: p.refDate, poNo: p.poNo, lines, evidenceUrl,
    });
    res.json({ text, lang, phone: sup?.whatsapp ?? null, link: waLink(text, sup?.whatsapp ?? undefined), flagIds: group.map(g => g.id), evidenceUrl });
  });

  /** Owner tapped "Open WhatsApp". First tap stamps sentAt (all flags in the message share it); a reminder only logs flag.remind. */
  r.post('/flags/sent', requireCan('send_message'), async (req, res) => {
    const body = z.object({ flagIds: z.array(z.string()).min(1).max(50), reminder: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const ids = [...new Set(body.data.flagIds)];
    const rows = await db.select().from(S.flags).where(inArray(S.flags.id, ids));
    if (rows.length !== ids.length) throw new ApiError(404, 'not_found', 'Aduan tiada');
    if (new Set(rows.map(x => x.invoiceId ?? x.deliveryId)).size > 1) throw new ApiError(400, 'bad_request', 'Aduan mesti dari invois atau penghantaran yang sama');
    const at = Date.now();
    await db.transaction(async tx => {
      for (const row of rows) {
        if (body.data.reminder) {
          if (row.status !== 'open' && row.status !== 'disputed') throw new ApiError(409, 'bad_state', 'Aduan ini belum boleh dihantar');
          await logEvent(tx, req.role!, 'flag.remind', row.id);
          continue;
        }
        let next;
        try { next = markSent(flagRowToCore(row), at); } catch { throw new ApiError(409, 'bad_state', 'Aduan ini belum boleh dihantar'); }
        if (!row.sentAt) await tx.update(S.flags).set(flagCoreToPatch(next)).where(eq(S.flags.id, row.id));
        await logEvent(tx, req.role!, 'flag.send_whatsapp', row.id);
      }
    });
    res.json({ ok: true, sentAt: body.data.reminder ? null : at });
  });
  return r;
}
