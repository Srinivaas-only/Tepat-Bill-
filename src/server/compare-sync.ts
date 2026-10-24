// Keeps a compared invoice's received quantities equal to its linked delivery (one quantity record).
import { eq } from 'drizzle-orm';
import * as S from '../shared/schema';
import { receivedFromDelivery } from '../shared/core';
import type { Db } from './db';
import { lockInvoice } from './flag-ops';
import { logEvent } from './events';
import { defaultCounts, loadContext, markStaleFlags, replaceProposedFlags, runDetection, snapshotOf } from './flags';
import { defaultDeliveryCounts, loadDeliveryContext } from './delivery-ctx';

type Conn = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;

/** Call after a delivery's counts change (recount or redelivery). Rewrites the invoice counts from the delivery, re-detects, flags stale approved/settled flags for owner review. */
export async function resyncComparedInvoice(db: Conn, deliveryId: string, role: 'owner' | 'staff') {
  const [del] = await db.select().from(S.deliveries).where(eq(S.deliveries.id, deliveryId));
  if (!del?.invoiceId) return;
  await lockInvoice(db as never, del.invoiceId);
  const c = await loadContext(db, del.invoiceId);
  const dc = await loadDeliveryContext(db, deliveryId);
  if (!c || !dc) return;
  const received = receivedFromDelivery({ supplierId: del.supplierId, po: c.po, deliveryLines: dc.delLines, deliveryReceived: { ...defaultDeliveryCounts(dc), ...dc.saved }, invoiceLines: c.invLines, aliases: c.aliases });
  const detected = runDetection(c, received, snapshotOf(c));
  const before = { ...defaultCounts(c), ...c.saved };
  const changes = Object.keys(received).filter(k => received[k] !== before[k]).map(k => ({ key: k, from: before[k] ?? null, to: received[k] }));
  await db.delete(S.receivedCounts).where(eq(S.receivedCounts.invoiceId, c.inv.id));
  await db.insert(S.receivedCounts).values(Object.entries(received).map(([key, qty]) => ({ invoiceId: c.inv.id, key, qty, source: c.savedSources[key] === 'staff' && c.saved[key] === qty ? 'staff' : 'delivery', recordedByRole: role })));
  await replaceProposedFlags(db, c, detected);
  const stale = await markStaleFlags(db, c.inv.id, detected);
  await logEvent(db, role, 'invoice.resync', c.inv.id, { deliveryId, recheck: stale, ...(changes.length ? { changes: changes.slice(0, 50) } : {}) });
}
