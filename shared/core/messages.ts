// Supplier message drafter. Fixed templates: every number comes from the rules engine, never from the AI.
// Factual tone only: no demands, no legal wording (spec). The owner reviews, then taps send in WhatsApp themselves.
import { formatRM, type Sen } from './rules';
import type { FlagRequest } from './ledger';

export type Lang = 'ms' | 'en';
export interface MessageLine {
  type: 'short_qty' | 'price_change' | 'not_ordered';
  item: string;
  amountSen: Sen;
  billedQty?: number; receivedQty?: number; missingQty?: number;      // short_qty
  invoiceUnitSen?: Sen; agreedUnitSen?: Sen; pricedQty?: number;       // price_change
  qty?: number;                                                        // not_ordered
  request: FlagRequest;
}
export interface MessageInput {
  lang: Lang; shopName: string; supplierName: string;
  invoiceNo: string; invoiceDate: string /* DD/MM/YYYY */; poNo?: string;
  lines: MessageLine[]; evidenceUrl: string;
}

const T = {
  ms: {
    hello: (s: string, shop: string) => `Salam ${s}, ini ${shop}.`,
    ref: (inv: string, d: string, po?: string) => `Untuk invois ${inv} bertarikh ${d}${po ? ` (pesanan ${po})` : ''}:`,
    short: (l: MessageLine) => `• ${l.item}: dibil ${l.billedQty}, diterima ${l.receivedQty}. Kurang ${l.missingQty} unit = ${formatRM(l.amountSen)}.`,
    price: (l: MessageLine) => `• ${l.item}: harga invois ${formatRM(l.invoiceUnitSen!)}/unit, harga dipersetujui ${formatRM(l.agreedUnitSen!)}/unit, untuk ${l.pricedQty} unit = beza ${formatRM(l.amountSen)}.`,
    notOrdered: (l: MessageLine) => `• ${l.item}: ${l.qty} unit (${formatRM(l.amountSen)}) tiada dalam pesanan kami.`,
    req: { send_missing: 'Mohon hantar baki barang yang kurang.', deduct: 'Mohon tolak jumlah ini daripada invois.',
      collect_back: 'Mohon ambil semula barang ini dan jangan caj.', agreed_price: 'Mohon caj mengikut harga dipersetujui.' },
    total: (s: string) => `Jumlah: ${s}.`,
    evidence: (u: string) => `Bukti (gambar & dokumen): ${u}`,
    thanks: 'Terima kasih.',
  },
  en: {
    hello: (s: string, shop: string) => `Hi ${s}, this is ${shop}.`,
    ref: (inv: string, d: string, po?: string) => `For invoice ${inv} dated ${d}${po ? ` (order ${po})` : ''}:`,
    short: (l: MessageLine) => `• ${l.item}: billed ${l.billedQty}, received ${l.receivedQty}. Short ${l.missingQty} units = ${formatRM(l.amountSen)}.`,
    price: (l: MessageLine) => `• ${l.item}: invoice price ${formatRM(l.invoiceUnitSen!)}/unit, agreed price ${formatRM(l.agreedUnitSen!)}/unit, for ${l.pricedQty} units = difference ${formatRM(l.amountSen)}.`,
    notOrdered: (l: MessageLine) => `• ${l.item}: ${l.qty} units (${formatRM(l.amountSen)}) were not in our order.`,
    req: { send_missing: 'Please send the missing items.', deduct: 'Please deduct this amount from the invoice.',
      collect_back: 'Please collect these items and do not charge them.', agreed_price: 'Please charge the agreed price.' },
    total: (s: string) => `Total: ${s}.`,
    evidence: (u: string) => `Evidence (photos & documents): ${u}`,
    thanks: 'Thank you.',
  },
} as const;

export function draftMessage(m: MessageInput): string {
  const t = T[m.lang];
  const out: string[] = [t.hello(m.supplierName, m.shopName), t.ref(m.invoiceNo, m.invoiceDate, m.poNo)];
  const requests = new Set<FlagRequest>();
  for (const l of m.lines) {
    out.push(l.type === 'short_qty' ? t.short(l) : l.type === 'price_change' ? t.price(l) : t.notOrdered(l));
    requests.add(l.request);
  }
  if (m.lines.length > 1) out.push(t.total(formatRM(m.lines.reduce((s, l) => s + l.amountSen, 0))));
  for (const r of requests) out.push(t.req[r]);
  out.push(t.evidence(m.evidenceUrl), t.thanks);
  return out.join('\n');
}

/** Malaysian number "012-345 6789" / "+60 12-345 6789" -> "60123456789". Returns undefined if unusable. */
export function toMsisdn(raw?: string): string | undefined {
  if (!raw) return undefined;
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0')) d = '6' + d;
  return /^60\d{8,10}$/.test(d) ? d : undefined;
}
/** wa.me deep link. No number -> WhatsApp opens its contact picker with the text prefilled. */
export const waLink = (text: string, phone?: string): string => {
  const n = toMsisdn(phone);
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`;
};
