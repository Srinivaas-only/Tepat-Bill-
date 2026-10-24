// Self-billed e-invoice for foreign suppliers: PREVIEW-ONLY STUB. Nothing is ever submitted to LHDN MyInvois.
import type { Role } from './roles';
import { can } from './roles';
import type { Sen } from './rules';

export interface Supplier { id: string; name: string; isForeign: boolean; country?: string; whatsapp?: string }
/** Generic TIN LHDN prescribes for foreign suppliers on self-billed e-invoices. */
export const FOREIGN_SUPPLIER_TIN = 'EI00000000030';
// 'submitted' is deliberately NOT a member: nothing can type-check as submitted to LHDN.
export type DraftStatus = 'draft' | 'approved' | 'released_stub';
export interface Buyer { name: string; tin: string; brn: string; address: string; msic?: string; sst?: string }
export interface SelfBilledDraft {
  supplierId: string; invoiceId: string; status: DraftStatus; label: 'Preview, not submitted to LHDN';
  fields: {
    eInvoiceType: '11';                  // 11 = self-billed invoice
    eInvoiceNo: string; issuedAt: number;
    supplierName: string; supplierTin: typeof FOREIGN_SUPPLIER_TIN; supplierCountry?: string;
    buyer: Buyer;
    currency: string; exchangeRateToMYR?: number;
    lines: { description: string; qty: number; unitPriceSen: Sen; totalSen: Sen }[];
    totalSen: Sen;                       // in the invoice currency's minor units
  };
}
export interface EventLog { who: Role; what: string; when: number; ref: string }

export function prepareSelfBilled(s: Supplier, inv: { id: string; invoiceNo: string; issuedAt: number; currency: string;
  exchangeRateToMYR?: number; lines: { description: string; qty: number; unitPriceSen: Sen }[] }, buyer: Buyer): SelfBilledDraft | null {
  if (s.isForeign !== true) return null;
  const lines = inv.lines.map(l => ({ ...l, totalSen: l.qty * l.unitPriceSen }));
  return { supplierId: s.id, invoiceId: inv.id, status: 'draft', label: 'Preview, not submitted to LHDN',
    fields: { eInvoiceType: '11', eInvoiceNo: `SB-${inv.invoiceNo}`, issuedAt: inv.issuedAt,
      supplierName: s.name, supplierTin: FOREIGN_SUPPLIER_TIN, supplierCountry: s.country, buyer,
      currency: inv.currency, exchangeRateToMYR: inv.exchangeRateToMYR, lines,
      totalSen: lines.reduce((t, l) => t + l.totalSen, 0) } };
}
export function approveDraft(d: SelfBilledDraft, role: Role): SelfBilledDraft {
  if (!can(role, 'approve_einvoice')) throw new Error('forbidden');
  if (d.status !== 'draft') throw new Error(`cannot approve from ${d.status}`);
  return { ...d, status: 'approved' };
}
/** Release = log an event only. No network call, no LHDN submission. */
export function releaseDraft(d: SelfBilledDraft, role: Role, now: number): { draft: SelfBilledDraft; event: EventLog } {
  if (!can(role, 'release_einvoice')) throw new Error('forbidden');
  if (d.status !== 'approved') throw new Error('approve before release');
  return { draft: { ...d, status: 'released_stub' }, event: { who: role, what: 'einvoice.release_stub', when: now, ref: d.invoiceId } };
}

export interface DraftIssue { code: 'buyer_tin' | 'buyer_brn' | 'buyer_address' | 'buyer_name' | 'rate' | 'supplier_country' | 'lines' | 'total'; }
/** What LHDN would reject before it ever sees the document: missing buyer identity, missing exchange rate, unmapped supplier country, empty or zero-value invoice. */
export function validateSelfBilled(d: SelfBilledDraft): DraftIssue[] {
  const f = d.fields, out: DraftIssue[] = [];
  if (!f.buyer.name?.trim()) out.push({ code: 'buyer_name' });
  if (!f.buyer.tin?.trim()) out.push({ code: 'buyer_tin' });
  if (!f.buyer.brn?.trim()) out.push({ code: 'buyer_brn' });
  if (!f.buyer.address?.trim()) out.push({ code: 'buyer_address' });
  if (f.currency !== 'MYR' && !(f.exchangeRateToMYR && f.exchangeRateToMYR > 0)) out.push({ code: 'rate' });
  if (!f.supplierCountry?.trim()) out.push({ code: 'supplier_country' });
  if (!f.lines.length) out.push({ code: 'lines' });
  if (f.totalSen <= 0) out.push({ code: 'total' });
  return out;
}
