// Flag lifecycle + money. Pure; amount owed is always derived, never stored.
import { assertSen, type Sen, type FlagType, type BaselineSource } from './rules';

export type FlagStatus = 'proposed' | 'open' | 'disputed' | 'settled' | 'dismissed';
export type Settlement = 'redelivered' | 'credit_note' | 'deducted';
export type FlagRequest = 'send_missing' | 'deduct' | 'collect_back' | 'agreed_price';
export interface Flag {
  id: string; supplierId: string; invoiceId: string; poId: string; invoiceLineId: string;
  type: FlagType; amountSen: Sen; status: FlagStatus; settlement?: Settlement;
  request?: FlagRequest;
  /** supplier-accepted amount for a credit note / deduction, recorded by the owner (default = the full flagged amount) */
  acceptedSen?: Sen;
  baselineUnitSen?: Sen; baselineSource?: BaselineSource;
  openedAt?: number;   // ms epoch, set when owner approves (proposed -> open)
  sentAt?: number;     // ms epoch, set when owner taps "Open WhatsApp"
  settledAt?: number;  // ms epoch
  photoIds: string[];
  /** set on the unrecovered balance of a partially accepted claim: counted as open/settled money but never as new flagged money */
  parentId?: string;
}
export interface Invoice {
  id: string; supplierId: string; poId: string; invoiceNo: string; totalSen: Sen;
  issuedAt: number;                // ms epoch, defines "next invoice"
  payment: 'on_credit' | 'paid';
  paidAt?: number;
  dueAt?: number;                  // ~90 days for on_credit, editable
}

const DAY = 86_400_000;
export const defaultDueAt = (issuedAt: number) => issuedAt + 90 * DAY;

// ---------- transitions ----------
const allowed: Record<FlagStatus, FlagStatus[]> = {
  proposed: ['open', 'dismissed'],
  open: ['disputed', 'settled'],
  disputed: ['open', 'settled'],
  settled: [], dismissed: [],
};
export function transition(f: Flag, to: FlagStatus, at: number, settlement?: Settlement, acceptedSen?: Sen): Flag {
  if (!allowed[f.status].includes(to)) throw new Error(`illegal ${f.status} -> ${to}`);
  if (to === 'settled') {
    if (!settlement) throw new Error('settled needs a settlement kind');
    if (settlement === 'redelivered' && f.type !== 'short_qty') throw new Error('redelivered only applies to short_qty');
    if (acceptedSen !== undefined) {
      if (settlement === 'redelivered') throw new Error('redelivered has no accepted amount');
      assertSen(acceptedSen, 'accepted amount');
      if (acceptedSen < 0 || acceptedSen > f.amountSen) throw new Error('accepted amount must be between 0 and the flagged amount');
    }
    return { ...f, status: 'settled', settlement, settledAt: at, ...(acceptedSen !== undefined ? { acceptedSen } : {}) };
  }
  return { ...f, status: to, openedAt: to === 'open' && f.openedAt === undefined ? at : f.openedAt };
}
/** Owner tapped "Open WhatsApp". Only Open/Disputed flags can be sent; first tap wins. */
export function markSent(f: Flag, at: number): Flag {
  if (f.status !== 'open' && f.status !== 'disputed') throw new Error(`cannot send a ${f.status} flag`);
  return f.sentAt === undefined ? { ...f, sentAt: at } : f;
}

/** Money-reducing = settled by credit note or deduction. Open/Disputed/Redelivered/Dismissed never move money. */
/** Money the supplier actually accepted back (flagged money is NOT recovered money). Defaults to the flagged amount. */
export const recoveredOf = (f: Flag): Sen => f.acceptedSen ?? f.amountSen;
export const reducesOwed = (f: Flag) => f.status === 'settled' && (f.settlement === 'credit_note' || f.settlement === 'deducted');

export interface InvoiceRow { id: string; grossSen: Sen; reductionSen: Sen; creditAppliedSen: Sen; netOwedSen: Sen }
export interface SupplierLedger {
  owedSen: Sen;          // what the supplier's statement should bill = "expected statement balance"
  disputedSen: Sen;      // part of owed that is under dispute (still owed; the app never assumes the owner is right)
  payNowSen: Sen;        // owed - disputed, floored at 0
  creditCarrySen: Sen;   // "Supplier owes you RM X"
  recoveredSen: Sen;     // all money-reducing settlements
  rows: InvoiceRow[];
}

/**
 * owed = sum of unpaid on-credit invoices (gross - own credit/deductions - supplier credit applied), floored at 0 per invoice.
 * A credit/deduction on an invoice that was already PAID when it settled becomes supplier credit,
 * applied to the next unpaid on-credit invoice(s) issued at/after the credit arose (in issue order); the rest carries forward.
 * Excess reduction on an unpaid invoice (reduction > gross) also becomes credit. Owed and carry are never negative.
 */
export function supplierLedger(supplierId: string, invoices: Invoice[], flags: Flag[]): SupplierLedger {
  const invs = invoices.filter(i => i.supplierId === supplierId).sort((a, b) => a.issuedAt - b.issuedAt || a.id.localeCompare(b.id));
  const fl = flags.filter(f => f.supplierId === supplierId);
  for (const i of invs) assertSen(i.totalSen, 'invoice total');
  for (const f of fl) { assertSen(f.amountSen, 'flag amount'); if (f.amountSen < 0) throw new Error('flag amount < 0'); }

  const credits: { at: number; sen: Sen }[] = [];
  const unpaid: { inv: Invoice; reduction: Sen }[] = [];
  let recovered = 0;
  for (const inv of invs) {
    const reds = fl.filter(f => f.invoiceId === inv.id && reducesOwed(f));
    let ownReduction = 0;
    for (const f of reds) {
      recovered += recoveredOf(f);
      const paidBefore = inv.payment === 'paid' && (inv.paidAt === undefined || (f.settledAt ?? 0) >= inv.paidAt);
      if (paidBefore) credits.push({ at: f.settledAt ?? inv.issuedAt, sen: recoveredOf(f) });
      else ownReduction += recoveredOf(f);
    }
    if (inv.payment === 'paid') continue; // reductions settled before payment were netted into what the owner paid
    unpaid.push({ inv, reduction: ownReduction });
  }
  const rows: InvoiceRow[] = [];
  credits.sort((a, b) => a.at - b.at);
  const pool: { at: number; sen: Sen }[] = [...credits];
  for (const { inv, reduction } of unpaid) {
    let net = inv.totalSen - reduction;
    if (net < 0) { pool.push({ at: inv.issuedAt, sen: -net }); net = 0; }
    let applied = 0;
    for (const c of pool) {
      if (net === 0) break;
      if (c.sen === 0 || c.at > inv.issuedAt) continue; // only invoices issued at/after the credit arose ("next invoice")
      const take = Math.min(c.sen, net); c.sen -= take; net -= take; applied += take;
    }
    rows.push({ id: inv.id, grossSen: inv.totalSen, reductionSen: reduction, creditAppliedSen: applied, netOwedSen: net });
  }
  const owedSen = rows.reduce((s, r) => s + r.netOwedSen, 0);
  // a dispute only holds back money that is actually still owed on ITS OWN invoice: a disputed flag on a fully credited invoice must not hide what is owed on another one
  const netById = new Map(rows.map(r => [r.id, r.netOwedSen]));
  const disputedByInvoice = new Map<string, number>();
  for (const f of fl) if (f.status === 'disputed' && netById.has(f.invoiceId)) disputedByInvoice.set(f.invoiceId, (disputedByInvoice.get(f.invoiceId) ?? 0) + f.amountSen);
  let disputedSen = 0;
  for (const [id, sum] of disputedByInvoice) disputedSen += Math.min(sum, netById.get(id) ?? 0);
  disputedSen = Math.min(disputedSen, owedSen);
  return { owedSen, disputedSen, payNowSen: owedSen - disputedSen,
    creditCarrySen: pool.reduce((s, c) => s + c.sen, 0), recoveredSen: recovered, rows };
}

/** Soft "follow up" reminder: Open or Disputed, >= 14 whole days since the WhatsApp message was sent (or approval if never sent). */
export const needsReminder = (f: Flag, now: number, days = 14) => {
  if (f.status !== 'open' && f.status !== 'disputed') return false;
  const from = f.sentAt ?? f.openedAt;
  return from !== undefined && Math.floor((now - from) / DAY) >= days;
};

// ---------- order state ----------
export type OrderState = 'recorded' | 'has_flags' | 'correct';
const unresolved = (f: Flag) => f.status === 'proposed' || f.status === 'open' || f.status === 'disputed';
/** Derived state of one invoice/delivery. 'correct' only after the owner marked it AND nothing is unresolved. */
export function orderState(invoiceId: string, flags: Flag[], ownerMarkedCorrect: boolean): OrderState {
  const mine = flags.filter(f => f.invoiceId === invoiceId);
  if (mine.some(unresolved)) return 'has_flags';
  return ownerMarkedCorrect ? 'correct' : 'recorded';
}
export const canMarkCorrect = (invoiceId: string, flags: Flag[]) => !flags.some(f => f.invoiceId === invoiceId && unresolved(f));

// ---------- home summary ----------
/** RM flagged / settled / open for flags approved in [from, to). Home uses the last 30 days (robust on any demo date). */
export function rangeSummary(flags: Flag[], from: number, to: number) {
  const counted = flags.filter(f => f.status !== 'proposed' && f.status !== 'dismissed' && f.openedAt !== undefined && f.openedAt >= from && f.openedAt < to);
  const sum = (xs: Flag[]) => xs.reduce((s, f) => s + f.amountSen, 0);
  return {
    flaggedSen: sum(counted.filter(f => !f.parentId)),
    settledSen: counted.filter(f => f.status === 'settled').reduce((s, f) => s + (reducesOwed(f) ? recoveredOf(f) : f.amountSen), 0),
    openSen: sum(counted.filter(f => f.status === 'open' || f.status === 'disputed')),
  };
}
export const last30Days = (flags: Flag[], now: number) => rangeSummary(flags, now - 30 * DAY, now + 1);
/** This month's RM flagged / settled / open. A flag counts in the month it was approved (openedAt). */
export function monthSummary(flags: Flag[], year: number, month0: number) {
  const inMonth = (t?: number) => t !== undefined && new Date(t).getFullYear() === year && new Date(t).getMonth() === month0;
  const counted = flags.filter(f => f.status !== 'proposed' && f.status !== 'dismissed' && inMonth(f.openedAt));
  const sum = (xs: Flag[]) => xs.reduce((s, f) => s + f.amountSen, 0);
  return {
    flaggedSen: sum(counted.filter(f => !f.parentId)),
    settledSen: counted.filter(f => f.status === 'settled').reduce((s, f) => s + (reducesOwed(f) ? recoveredOf(f) : f.amountSen), 0),
    openSen: sum(counted.filter(f => f.status === 'open' || f.status === 'disputed')),
  };
}
