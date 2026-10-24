// Supplier message drafter. Fixed templates: every number comes from the rules engine, never from the AI.
// Factual tone only: no demands, no legal wording (spec). The owner reviews, then taps send in WhatsApp themselves.
import { formatRM, type Sen } from './rules';
import type { FlagRequest } from './ledger';

export type Lang = 'ms' | 'en';
type DocKind = 'invoice' | 'delivery';
export interface MessageLine {
  type: 'short_qty' | 'price_change' | 'not_ordered';
  item: string;
  amountSen: Sen;
  billedQty?: number; receivedQty?: number; missingQty?: number;      // short_qty
  invoiceUnitSen?: Sen; agreedUnitSen?: Sen; pricedQty?: number;       // price_change
  /** where the reference price came from; only 'agreed' (or unset) may be called an agreed price: a historical price alone proves no agreement */
  baselineSource?: 'agreed' | 'po' | 'last_invoice';
  qty?: number;                                                        // not_ordered
  request: FlagRequest;
}
export interface MessageInput {
  lang: Lang; shopName: string; supplierName: string;
  invoiceNo: string; invoiceDate: string /* DD/MM/YYYY */; poNo?: string;
  lines: MessageLine[]; evidenceUrl: string;
  /** 'delivery': the numbers come from a bon/DO and are estimates, so the wording says bon and never states an unknown RM0.00. Default 'invoice'. */
  docKind?: 'invoice' | 'delivery';
}

const units = (n: number, en: boolean) => en ? `${n} unit${n === 1 ? '' : 's'}` : `${n} unit`;
const T = {
  ms: {
    hello: (s: string, shop: string) => `Salam sejahtera ${s}, ini ${shop}.`,
    ref: (inv: string, d: string, po?: string, k: DocKind = 'invoice') => `Merujuk ${k === 'delivery' ? 'bon penghantaran' : 'invois'} ${inv} bertarikh ${d}${po ? ` (pesanan ${po})` : ''}:`,
    short: (l: MessageLine, k: DocKind = 'invoice') => k === 'delivery'
      ? `• ${l.item}: dalam bon ${l.billedQty}, diterima ${l.receivedQty}. Kurang ${units(l.missingQty!, false)}${l.amountSen > 0 ? ` (anggaran ${formatRM(l.amountSen)})` : ''}.`
      : `• ${l.item}: dalam invois ${l.billedQty}, diterima ${l.receivedQty}. Kurang ${l.missingQty} unit = ${formatRM(l.amountSen)}.`,
    price: (l: MessageLine) => `• ${l.item}: harga invois ${formatRM(l.invoiceUnitSen!)}/unit, ${l.baselineSource === 'po' ? 'harga pesanan (PO)' : l.baselineSource === 'last_invoice' ? 'harga invois sebelum ini' : 'harga yang dipersetujui'} ${formatRM(l.agreedUnitSen!)}/unit, untuk ${l.pricedQty} unit = perbezaan ${formatRM(l.amountSen)}.`,
    notOrdered: (l: MessageLine, k: DocKind = 'invoice') => `• ${l.item}: ${l.qty} unit${k === 'delivery' && l.amountSen <= 0 ? '' : ` (${k === 'delivery' ? 'anggaran ' : ''}${formatRM(l.amountSen)})`} tiada dalam pesanan kami.`,
    req: { send_missing: 'Mohon hantar baki barang yang kurang.', deduct: 'Mohon tolak jumlah ini daripada invois.',
      collect_back: 'Mohon ambil semula barang ini dan keluarkan daripada invois.', agreed_price: 'Mohon caj mengikut harga yang dipersetujui.' },
    reqDelivery: { send_missing: 'Mohon hantar baki barang yang kurang.', deduct: 'Mohon laraskan jumlah ini pada invois.',
      collect_back: 'Mohon ambil semula barang ini.', agreed_price: 'Mohon caj mengikut harga yang dipersetujui.' },
    total: (s: string, k: DocKind = 'invoice') => `${k === 'delivery' ? 'Anggaran jumlah' : 'Jumlah'}: ${s}.`,
    evidence: (u: string) => `Bukti (gambar & dokumen): ${u}`,
    thanks: 'Terima kasih.',
  },
  en: {
    hello: (s: string, shop: string) => `Hi ${s}, this is ${shop}.`,
    ref: (inv: string, d: string, po?: string, k: DocKind = 'invoice') => `For ${k === 'delivery' ? 'delivery order' : 'invoice'} ${inv} dated ${d}${po ? ` (order ${po})` : ''}:`,
    short: (l: MessageLine, k: DocKind = 'invoice') => k === 'delivery'
      ? `• ${l.item}: delivery order ${l.billedQty}, received ${l.receivedQty}. Short ${units(l.missingQty!, true)}${l.amountSen > 0 ? ` (estimate ${formatRM(l.amountSen)})` : ''}.`
      : `• ${l.item}: billed ${l.billedQty}, received ${l.receivedQty}. Short ${units(l.missingQty!, true)} = ${formatRM(l.amountSen)}.`,
    price: (l: MessageLine) => `• ${l.item}: invoice price ${formatRM(l.invoiceUnitSen!)}/unit, ${l.baselineSource === 'po' ? 'order (PO) price' : l.baselineSource === 'last_invoice' ? 'previous invoice price' : 'agreed price'} ${formatRM(l.agreedUnitSen!)}/unit, for ${units(l.pricedQty!, true)} = difference ${formatRM(l.amountSen)}.`,
    notOrdered: (l: MessageLine, k: DocKind = 'invoice') => `• ${l.item}: ${units(l.qty!, true)}${k === 'delivery' && l.amountSen <= 0 ? '' : ` (${k === 'delivery' ? 'estimate ' : ''}${formatRM(l.amountSen)})`} ${l.qty === 1 ? 'was' : 'were'} not in our order.`,
    req: { send_missing: 'Please send the missing items.', deduct: 'Please deduct this amount from the invoice.',
      collect_back: 'Please collect these items and remove them from the invoice.', agreed_price: 'Please charge the agreed price.' },
    reqDelivery: { send_missing: 'Please send the missing items.', deduct: 'Please adjust this amount on the invoice.',
      collect_back: 'Please collect these items.', agreed_price: 'Please charge the agreed price.' },
    total: (s: string, k: DocKind = 'invoice') => `${k === 'delivery' ? 'Estimated total' : 'Total'}: ${s}.`,
    evidence: (u: string) => `Evidence (photos & documents): ${u}`,
    thanks: 'Thank you.',
  },
} as const;

export function draftMessage(m: MessageInput): string {
  const t = T[m.lang];
  const k: DocKind = m.docKind ?? 'invoice';
  const out: string[] = [t.hello(m.supplierName, m.shopName), t.ref(m.invoiceNo, m.invoiceDate, m.poNo, k)];
  const requests = new Set<FlagRequest>();
  for (const l of m.lines) {
    out.push(l.type === 'short_qty' ? t.short(l, k) : l.type === 'price_change' ? t.price(l) : t.notOrdered(l, k));
    requests.add(l.request);
  }
  const sum = m.lines.reduce((s, l) => s + l.amountSen, 0);
  if (m.lines.length > 1 && (k === 'invoice' || sum > 0)) out.push(t.total(formatRM(sum), k));
  for (const r of requests) out.push((k === 'delivery' ? t.reqDelivery : t.req)[r]);
  out.push(t.evidence(m.evidenceUrl), t.thanks);
  return out.join('\n');
}

/** Malaysian number "012-345 6789" / "+60 12-345 6789" -> "60123456789". Returns undefined if unusable. */
export function toMsisdn(raw?: string): string | undefined {
  if (!raw) return undefined;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);        // 0060... international prefix
  if (d.startsWith('600')) d = '60' + d.slice(3); // +60 012-...: the trunk 0 must not be kept after the country code
  if (d.startsWith('0')) d = '6' + d;
  return /^601\d{7,9}$/.test(d) ? d : undefined;  // WhatsApp runs on mobile numbers (01x) only
}
/** wa.me deep link. No number -> WhatsApp opens its contact picker with the text prefilled. */
export const waLink = (text: string, phone?: string): string => {
  const n = toMsisdn(phone);
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`;
};
