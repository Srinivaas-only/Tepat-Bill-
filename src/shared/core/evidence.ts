// Supplier-facing evidence page payload. WHITELIST builder: only that one flag's documents. Never owed totals or other flags.
import type { Flag, Invoice } from './ledger';
import type { InvLine, PoLine, BaselineSource, Sen } from './rules';

export type PhotoKind = 'invoice' | 'po' | 'signed_bon' | 'delivery';
export interface Photo { id: string; kind: PhotoKind; url: string }
export interface Db {
  flags: Flag[]; invoices: (Invoice & { lines: InvLine[] })[];
  pos: { id: string; poNo: string; supplierId: string; lines: PoLine[] }[]; photos: Photo[];
}
export interface EvidencePayload {
  flag: Pick<Flag, 'id' | 'type' | 'amountSen' | 'status' | 'settlement' | 'request'>;
  po: { poNo: string; lines: PoLine[] } | null;
  invoice: { invoiceNo: string; issuedAt: number; totalSen: Sen; lines: InvLine[] };
  baseline: { unitSen: Sen; source: BaselineSource } | null;  // price_change only: why the price is disputed
  photos: Photo[];
  highlight: { invoiceLineId: string; box_2d: [number, number, number, number] | null };
}
export function buildEvidence(db: Db, flagId: string): EvidencePayload {
  const f = db.flags.find(x => x.id === flagId); if (!f) throw new Error('not found');
  if (f.status === 'proposed' || f.status === 'dismissed') throw new Error('not found'); // never expose unapproved flags
  const inv = db.invoices.find(i => i.id === f.invoiceId); if (!inv) throw new Error('invoice missing');
  const po = db.pos.find(p => p.id === f.poId) ?? null;
  const line = inv.lines.find(l => l.lineId === f.invoiceLineId);
  return {
    flag: { id: f.id, type: f.type, amountSen: f.amountSen, status: f.status, settlement: f.settlement, request: f.request },
    po: po && { poNo: po.poNo, lines: po.lines },
    invoice: { invoiceNo: inv.invoiceNo, issuedAt: inv.issuedAt, totalSen: inv.totalSen, lines: inv.lines },
    baseline: f.type === 'price_change' && f.baselineUnitSen !== undefined && f.baselineSource
      ? { unitSen: f.baselineUnitSen, source: f.baselineSource } : null,
    photos: db.photos.filter(p => f.photoIds.includes(p.id)),
    highlight: { invoiceLineId: f.invoiceLineId, box_2d: line?.box ?? null },
  };
}
