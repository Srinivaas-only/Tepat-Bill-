import { Router } from 'express';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import * as S from '../../shared/schema';
import { draftMessage, markSent, waLink, type FlagType, type MessageLine } from '../../shared/core';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';
import { flagCoreToPatch, flagRowToCore } from '../core-adapters';
import { loadContext } from '../flags';
import { REQUESTS } from './flag-actions';

const ORDER: Record<string, number> = { short_qty: 0, price_change: 1, not_ordered: 2 };
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

export function messagesRouter(deps: AppDeps) {
  const r = Router();
  const { db } = deps;
  r.use('/flags', requireAuth);

  r.get('/flags/:id/message', requireCan('send_message'), async (req, res) => {
    const lang = req.query.lang === 'en' ? 'en' : 'ms';
    const reminder = req.query.reminder === '1';
    const [flag] = await db.select().from(S.flags).where(eq(S.flags.id, String(req.params.id)));
    if (!flag) throw new ApiError(404, 'not_found', 'Aduan tiada');
    if (flag.status !== 'open' && flag.status !== 'disputed') throw new ApiError(409, 'bad_state', 'Aduan ini belum boleh dihantar');
    const siblings = await db.select().from(S.flags).where(eq(S.flags.invoiceId, flag.invoiceId));
    const group = reminder
      ? siblings.filter(s => s.id === flag.id || (flag.sentAt && s.sentAt?.getTime() === flag.sentAt.getTime() && (s.status === 'open' || s.status === 'disputed')))
      : siblings.filter(s => s.id === flag.id || (s.status === 'open' && !s.sentAt));
    const c = await loadContext(db, flag.invoiceId);
    if (!c) throw new ApiError(404, 'not_found', 'Invois tiada');
    const pos = (id: string) => c.lines.find(l => l.lineId === id)?.position ?? 0;
    group.sort((a, b) => pos(a.invoiceLineId) - pos(b.invoiceLineId) || ORDER[a.type] - ORDER[b.type]);
    const lines: MessageLine[] = group.map(g => {
      const l = c.lines.find(x => x.lineId === g.invoiceLineId)!;
      const base = { type: g.type as FlagType, item: l.description, amountSen: g.amountSen, request: (g.request ?? REQUESTS[g.type as FlagType][0]) as MessageLine['request'] };
      if (g.type === 'short_qty') return { ...base, billedQty: l.qty, receivedQty: l.qty - (g.missingQty ?? 0), missingQty: g.missingQty ?? 0 };
      if (g.type === 'price_change') return { ...base, invoiceUnitSen: g.invoiceUnitSen ?? l.unitPriceSen, agreedUnitSen: g.baselineUnitSen ?? 0, pricedQty: g.pricedQty ?? 0 };
      return { ...base, qty: l.qty };
    });
    const [sup] = await db.select().from(S.suppliers).where(eq(S.suppliers.id, flag.supplierId));
    const [shop] = await db.select().from(S.settings).where(eq(S.settings.key, 'shop'));
    const origin = process.env.PUBLIC_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
    const evidenceUrl = `${origin.replace(/\/$/, '')}/e/${group[0].evidenceToken}`;
    const text = draftMessage({
      lang, shopName: (shop?.value as { name?: string } | undefined)?.name ?? 'Kedai', supplierName: sup?.name ?? '', invoiceNo: c.inv.invoiceNo,
      invoiceDate: c.inv.docDate ? c.inv.docDate.split('-').reverse().join('/') : dmy(c.inv.issuedAt), poNo: c.poRow?.poNo, lines, evidenceUrl,
    });
    if (reminder) await logEvent(db, req.role!, 'flag.remind', flag.id);
    res.json({ text, lang, phone: sup?.whatsapp ?? null, link: waLink(text, sup?.whatsapp ?? undefined), flagIds: group.map(g => g.id), evidenceUrl });
  });

  /** Owner tapped "Open WhatsApp": first tap wins; all flags in the message get the same timestamp. */
  r.post('/flags/sent', requireCan('send_message'), async (req, res) => {
    const body = z.object({ flagIds: z.array(z.string()).min(1) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const ids = [...new Set(body.data.flagIds)];
    const rows = await db.select().from(S.flags).where(inArray(S.flags.id, ids));
    if (rows.length !== ids.length) throw new ApiError(404, 'not_found', 'Aduan tiada');
    if (new Set(rows.map(x => x.invoiceId)).size > 1) throw new ApiError(400, 'bad_request', 'Aduan mesti dari invois yang sama');
    const at = Date.now();
    await db.transaction(async tx => {
      for (const row of rows) {
        let next;
        try { next = markSent(flagRowToCore(row), at); } catch { throw new ApiError(409, 'bad_state', 'Aduan ini belum boleh dihantar'); }
        if (!row.sentAt) await tx.update(S.flags).set(flagCoreToPatch(next)).where(eq(S.flags.id, row.id));
        await logEvent(tx, req.role!, 'flag.send_whatsapp', row.id);
      }
    });
    res.json({ ok: true, sentAt: at });
  });
  return r;
}
