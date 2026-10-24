// Owner routes from PRD section 8, registered as 501 stubs behind their guards so the 403 check passes before features exist.
// Real routers are mounted before this one; a stub is only reached while its feature is not built yet.
import { Router } from 'express';
import type { Action } from '../../shared/core';
import { requireAuth, requireCan } from '../auth';
import { ApiError } from '../app';

type M = 'get' | 'post' | 'patch' | 'put';
const OWNER_ROUTES: [M, string, Action][] = [
  ['post', '/flags/:id/approve', 'approve_flag'],
  ['post', '/flags/:id/dismiss', 'dismiss_flag'],
  ['post', '/flags/:id/report-price', 'set_agreed_price'],
  ['post', '/flags/:id/link-substitute', 'approve_flag'],
  ['get', '/flags/:id/message', 'send_message'],
  ['post', '/flags/sent', 'send_message'],
  ['post', '/flags/:id/dispute', 'dispute_flag'],
  ['post', '/flags/:id/reopen', 'dispute_flag'],
  ['post', '/flags/:id/settle', 'settle_flag'],
  ['patch', '/invoices/:id/payment', 'mark_paid'],
  ['post', '/invoices/:id/mark-correct', 'mark_correct'],
  ['patch', '/suppliers/:id', 'edit_supplier'],
  ['post', '/invoices/:id/einvoice', 'approve_einvoice'],
  ['post', '/invoices/:id/einvoice/approve', 'approve_einvoice'],
  ['post', '/invoices/:id/einvoice/release', 'release_einvoice'],
  ['get', '/export.csv', 'export_csv'],
  ['post', '/dev/reset', 'edit_supplier'],
];

export function stubRouter() {
  const r = Router();
  for (const [m, path, action] of OWNER_ROUTES)
    r[m](path, requireAuth, requireCan(action), () => { throw new ApiError(501, 'not_implemented', 'Belum tersedia'); });
  return r;
}
