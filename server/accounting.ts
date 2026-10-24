// Accounting-partner / Orbyte handoff. No real API contract exists yet, so the default connector is a SIMULATION that sends nothing.
// A webhook connector is ready for the day a contract exists: it is OFF unless ACCOUNTING_WEBHOOK_URL (https) AND ACCOUNTING_WEBHOOK_SECRET are set.
// Every number comes from supplierLedger via ledgerFor, so the payload cannot drift from the app.
import { createHmac } from 'node:crypto';
import * as S from '../shared/schema';
import { recoveredOf } from '../shared/core';
import type { Db } from './db';
import { flagRowToCore } from './core-adapters';
import { ledgerFor } from './ledger-data';

export interface AccountingPayload {
  schema: 'tepat-bill.accounting.v0-draft';   // draft: to be replaced by the partner's real contract
  generatedAt: string;
  currency: 'MYR';
  suppliers: {
    id: string; name: string;
    payNowSen: number; disputedSen: number; owedSen: number; creditCarrySen: number; recoveredSen: number;
    invoices: { id: string; invoiceNo: string; payment: string; grossSen: number; reductionSen: number; creditAppliedSen: number; netOwedSen: number }[];
    flags: { id: string; invoiceNo: string; type: string; status: string; flaggedSen: number; residueSen: number; acceptedSen: number | null; recoveredSen: number; settlement: string | null; reference: string | null; parentFlagId: string | null }[];
  }[];
}

export async function buildAccountingPayload(db: Pick<Db, 'select'>, now = new Date()): Promise<AccountingPayload> {
  const sups = await db.select().from(S.suppliers);
  const out: AccountingPayload['suppliers'] = [];
  for (const s of sups) {
    const { invRows, ledger } = await ledgerFor(db, s.id);
    const flagRows = (await db.select().from(S.flags)).filter(f => f.supplierId === s.id && f.stage === 'invoice' && f.status !== 'proposed' && f.status !== 'dismissed');
    out.push({
      id: s.id, name: s.name,
      payNowSen: ledger.payNowSen, disputedSen: ledger.disputedSen, owedSen: ledger.owedSen, creditCarrySen: ledger.creditCarrySen, recoveredSen: ledger.recoveredSen,
      invoices: invRows.map(i => { const r = ledger.rows.find(x => x.id === i.id); return { id: i.id, invoiceNo: i.invoiceNo, payment: i.payment, grossSen: i.totalSen, reductionSen: r?.reductionSen ?? 0, creditAppliedSen: r?.creditAppliedSen ?? 0, netOwedSen: r?.netOwedSen ?? 0 }; }),
      flags: flagRows.map(f => {
        const core = flagRowToCore(f);
        const money = f.status === 'settled' && (f.settlement === 'credit_note' || f.settlement === 'deducted');
        return { id: f.id, invoiceNo: invRows.find(i => i.id === f.invoiceId)?.invoiceNo ?? '', type: f.type, status: f.status, flaggedSen: f.parentFlagId ? 0 : f.amountSen, residueSen: f.parentFlagId ? f.amountSen : 0, acceptedSen: f.acceptedSen,
          recoveredSen: money ? recoveredOf(core) : 0, settlement: f.settlement, reference: f.settlementRef, parentFlagId: f.parentFlagId };
      }),
    });
  }
  return { schema: 'tepat-bill.accounting.v0-draft', generatedAt: now.toISOString(), currency: 'MYR', suppliers: out };
}

export interface HandoffResult { mode: 'simulated' | 'webhook'; ok: boolean; detail: string }
export interface AccountingConnector { mode: HandoffResult['mode']; send(payload: AccountingPayload): Promise<HandoffResult> }

export const simulatedConnector: AccountingConnector = {
  mode: 'simulated',
  async send(p) { return { mode: 'simulated', ok: true, detail: `simulation: ${p.suppliers.length} suppliers, nothing was sent` }; },
};

export const signBody = (secret: string, body: string) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

export function webhookConnector(url: string, secret: string, fetchImpl: typeof fetch = fetch): AccountingConnector {
  return {
    mode: 'webhook',
    async send(p) {
      const body = JSON.stringify(p);
      try {
        const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tepat-signature': signBody(secret, body) }, body, redirect: 'error', signal: AbortSignal.timeout(10_000) });
        return { mode: 'webhook', ok: res.ok, detail: `HTTP ${res.status}` };
      } catch (e) { return { mode: 'webhook', ok: false, detail: (e as Error).message }; }
    },
  };
}

/** Webhook only when BOTH env vars are set and the URL is https; otherwise the simulation. Nothing is ever sent by default. */
export function connectorFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): AccountingConnector {
  const url = env.ACCOUNTING_WEBHOOK_URL?.trim(), secret = env.ACCOUNTING_WEBHOOK_SECRET?.trim();
  return url && secret && /^https:\/\//.test(url) ? webhookConnector(url, secret, fetchImpl) : simulatedConnector;
}
