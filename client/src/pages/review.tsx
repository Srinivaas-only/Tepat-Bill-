import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams, Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Trash2, Globe2, Link2, ChevronDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { can, looksForeign, tokenOverlap } from '@shared/core';
import type { ExtractedDoc } from '@shared/core/extract';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { formatMoney, isMoney, toBp, toSen } from '@/lib/money-input';
import { buzz } from '@/lib/haptics';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DocImage } from '@/components/doc-image';
import type { Box } from '@shared/schema';

interface Supplier { id: string; name: string; isForeign: boolean; country: string | null }
interface DocMeta { id: string; kind: string; width: number; height: number }
type ReadResult = { status: 'ok'; model: string; doc: ExtractedDoc } | { status: 'manual'; reason: string };
interface Candidate { id: string; score: number; poNo: string; supplierName: string; orderedAt: number }
interface Row { key: number; description: string; qty: string; unit: string; price: string; box: Box | null }

let rowKey = 0;
const blankRow = (): Row => ({ key: ++rowKey, description: '', qty: '1', unit: '', price: '', box: null });
const label = 'mb-1 block text-sm font-medium text-ink-2';

/** The AI often returns 'RM' (or nothing) for ringgit; the API only knows ISO codes. */
const normCur = (c?: string | null) => { const u = (c ?? '').trim().toUpperCase(); return !u || u === 'RM' ? 'MYR' : u; };

export default function Review() {
  const params = useParams<{ kind: string; id: string }>();
  const kind: 'po' | 'invoice' = params.kind === 'po' ? 'po' : 'invoice';
  const isNew = params.id === 'new';
  const docId = isNew ? new URLSearchParams(location.search).get('doc') : params.id;
  const { t } = useI18n();
  const { role } = useAuth();
  const [, nav] = useLocation();
  const qc = useQueryClient();

  const meta = useQuery({ queryKey: ['doc', docId], queryFn: () => api.get<DocMeta>(`/documents/${docId}`), enabled: !!docId });
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get<{ suppliers: Supplier[] }>('/suppliers') });
  const read = useQuery({
    queryKey: ['extract', docId], enabled: !!docId && !isNew, staleTime: Infinity,
    queryFn: () => api.post<ReadResult>(`/documents/${docId}/extract`),
  });

  // ---- form state (seeded once from the read)
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [docDate, setDocDate] = useState('');
  const [currency, setCurrency] = useState('MYR');
  const [rate, setRate] = useState('');
  const [printed, setPrinted] = useState('');
  const [country, setCountry] = useState<string | undefined>();
  const [source, setSource] = useState<'notebook' | 'whatsapp'>('notebook');
  const [poPick, setPoPick] = useState<string | null | undefined>(undefined);
  const [active, setActive] = useState<number | null>(null);
  const [supplierSheet, setSupplierSheet] = useState(false);
  const [poSheet, setPoSheet] = useState(false);
  const [dup, setDup] = useState<string | null>(null);
  const [foreignOk, setForeignOk] = useState(false);
  const [touched, setTouched] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || !suppliers.data) return;
    if (isNew) { seeded.current = true; return; }
    if (!read.data) return;
    seeded.current = true;
    if (read.data.status !== 'ok') return;
    const d = read.data.doc;
    setRows(d.lines.length ? d.lines.map(l => ({ key: ++rowKey, description: l.description, qty: String(l.qty), unit: l.unit ?? '', price: l.unitPrice ?? '', box: (l.box_2d ?? null) as Box | null })) : [blankRow()]);
    setInvoiceNo(d.docNo ?? ''); setDocDate(d.docDate ?? ''); setCurrency(normCur(d.currency));
    setPrinted(d.totalAmount ?? ''); setCountry(d.supplierCountry);
    if (normCur(d.currency) === 'USD') setRate('4.20');
    const best = suppliers.data.suppliers.map(s => ({ s, o: tokenOverlap(d.supplierName, s.name) })).sort((a, b) => b.o - a.o)[0];
    if (best && best.o >= 0.6) setSupplierId(best.s.id); else setNewName(d.supplierName);
  }, [read.data, suppliers.data, isNew]);

  const supplier = suppliers.data?.suppliers.find(s => s.id === supplierId);
  const supplierName = supplier?.name ?? newName;
  const cur = normCur(currency);
  const foreignInvoice = kind === 'invoice' && cur !== 'MYR';
  const boxes = useMemo(() => rows.map(r => r.box), [rows]);
  const offerForeign = kind === 'invoice' && !foreignOk && !supplier?.isForeign && looksForeign(cur, country);

  // ---- PO suggestion (invoice only)
  const sugg = useQuery({
    queryKey: ['po-sugg', supplierId, supplierName, rows.map(r => r.description).join('|')], enabled: kind === 'invoice' && !!supplierName,
    queryFn: () => api.post<{ candidates: Candidate[] }>('/po-suggestions', { supplierId: supplierId ?? undefined, supplierName, lines: rows.filter(r => r.description.trim()).map(r => ({ description: r.description })) }),
  });
  const cands = sugg.data?.candidates ?? [];
  const top = cands[0] && cands[0].score >= 0.5 ? cands[0] : undefined;
  const effectivePoId = poPick === undefined ? top?.id ?? null : poPick;
  const effectivePo = cands.find(c => c.id === effectivePoId);

  // ---- validation + totals
  const unitOf = (r: Row) => toSen(r.price);
  const rowOk = (r: Row) => r.description.trim() && /^\d+$/.test(r.qty) && (kind === 'po' ? r.price === '' || isMoney(r.price) : isMoney(r.price));
  const rateOk = !foreignInvoice || toBp(rate) !== undefined;
  const invoiceOk = kind === 'po' || (invoiceNo.trim() && rateOk);
  const supplierOk = !!supplierId || newName.trim().length > 0;
  const valid = supplierOk && invoiceOk && rows.length > 0 && rows.every(rowOk);
  const sum = rows.reduce((a, r) => a + (unitOf(r) ?? 0) * (Number(r.qty) || 0), 0);
  const printedMinor = toSen(printed);
  const mismatch = kind === 'invoice' && printedMinor !== undefined && printedMinor !== sum;

  const save = useMutation({
    mutationFn: async () => {
      const sup = supplierId ? { supplierId } : { newSupplier: { name: newName.trim(), isForeign: foreignOk || undefined, country } };
      if (kind === 'po') {
        return { po: await api.post<{ id: string; poNo: string }>('/pos', { ...sup, documentId: docId ?? undefined, source: docId ? source : 'typed',
          lines: rows.map(r => ({ description: r.description.trim(), qty: Number(r.qty), unit: r.unit.trim() || undefined, unitPriceSen: r.price ? unitOf(r) : null, box: r.box })) }) };
      }
      const bp = toBp(rate);
      return { inv: await api.post<{ id: string }>('/invoices', { ...sup, documentId: docId ?? undefined, poId: effectivePoId, invoiceNo: invoiceNo.trim(), docDate: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : undefined, currency: cur,
        ...(foreignInvoice ? { exchangeRateBp: bp, totalForeignMinor: printedMinor } : { totalSen: printedMinor }),
        lines: rows.map(r => ({ description: r.description.trim(), qty: Number(r.qty), unit: r.unit.trim() || undefined, box: r.box,
          ...(foreignInvoice ? { unitPriceForeignMinor: unitOf(r) } : { unitPriceSen: unitOf(r) }) })) }) };
    },
    onSuccess: r => {
      buzz(12);
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      if (r.po) { toast.success(t('review.poSaved', { po: r.po.poNo })); nav('/orders', { replace: true }); }
      else nav(`/invoices/${r.inv!.id}/count`, { replace: true });
    },
    onError: e => {
      if (e instanceof ApiError && e.code === 'duplicate_invoice') {
        const existing = String(e.extra?.invoiceId);
        setDup(existing);
        toast.error(t('review.dupToast'), { action: { label: t('review.openExisting'), onClick: () => nav(`/invoices/${existing}`) } });
      } else if (e instanceof ApiError && e.code === 'po_supplier_mismatch') toast.error(t('review.poOtherSupplier'));
      else toast.error(t('common.error'));
    },
  });
  const trySave = () => { setTouched(true); if (valid) save.mutate(); else toast.error(t('review.fillRequired')); };

  const patch = (key: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...p } : r)));
  const loading = suppliers.isLoading || (!isNew && !!docId && read.isLoading) || meta.isLoading;
  const rowIdx = (key: number) => rows.findIndex(r => r.key === key);

  return (
    <main className="px-5 pb-36 pt-5">
      <h1 className="mb-4 text-[28px] font-semibold leading-[34px]">{t(kind === 'po' ? 'review.po.title' : 'review.invoice.title')}</h1>
      {docId && meta.data && (
        <div className="mb-4"><DocImage src={`/api/documents/${docId}/file`} width={meta.data.width || 900} height={meta.data.height || 1180} alt={t(kind === 'po' ? 'scan.po' : 'scan.invoice')}
          layoutId={`doc-image-${docId}`} boxes={boxes} activeIndex={active} onBoxClick={setActive} maxHeight="34dvh" /></div>
      )}
      {(isNew || (read.data && read.data.status === 'manual')) && <p className="mb-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">{t('review.manualNote')}</p>}

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <span className={label}>{t('review.supplier')}</span>
            <button type="button" onClick={() => setSupplierSheet(true)} className="flex min-h-12 w-full items-center justify-between rounded-btn border border-line bg-surface px-4 text-left font-medium">
              <span className="truncate">{supplier?.name || newName || t('review.pickSupplier')}</span>
              <ChevronDown size={18} className="shrink-0 text-ink-2" aria-hidden />
            </button>
            {!supplier && newName !== undefined && supplierId === null && (
              <div className="mt-3"><span className={label}>{t('review.newSupplier')}</span><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('review.supplierName')} aria-invalid={touched && !supplierOk} /></div>
            )}
            {kind === 'po' && docId && (
              <div className="mt-3"><span className={label}>{t('review.source')}</span>
                <Tabs value={source} onValueChange={v => setSource(v as 'notebook' | 'whatsapp')}><TabsList><TabsTrigger value="notebook">{t('review.source.notebook')}</TabsTrigger><TabsTrigger value="whatsapp">{t('review.source.whatsapp')}</TabsTrigger></TabsList></Tabs>
              </div>
            )}
          </Card>

          {kind === 'invoice' && (
            <Card className="space-y-3 p-4">
              <div><span className={label}>{t('review.invoiceNo')}</span><Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} aria-invalid={touched && !invoiceNo.trim()} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className={label}>{t('review.date')}</span><Input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} /></div>
                <div><span className={label}>{t('review.currency')}</span><Input value={currency} maxLength={3} onChange={e => setCurrency(e.target.value.toUpperCase())} /></div>
              </div>
              {foreignInvoice && (
                <div><span className={label}>{t('review.rate')}</span><Input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="4.20" aria-invalid={touched && !rateOk} className="num" /></div>
              )}
              <div><span className={label}>{t('review.printedTotal')} ({currency})</span><Input inputMode="decimal" value={printed} onChange={e => setPrinted(e.target.value)} className="num" /></div>
            </Card>
          )}

          <AnimatePresence>
            {offerForeign && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <Card className="border-price/30 bg-price-bg p-4">
                  <div className="flex items-start gap-3"><Globe2 size={22} className="mt-0.5 shrink-0 text-price" aria-hidden />
                    <div className="flex-1"><p className="font-semibold text-price">{t('review.foreignQ')}</p><p className="text-sm text-ink-2">{t('review.foreignBody')}</p>
                      {role && can(role, 'edit_supplier') ? <Button size="sm" className="mt-3" onClick={() => setForeignOk(true)}>{t('review.foreignConfirm')}</Button> : <p className="mt-2 text-sm font-medium text-price">{t('owner.only')}</p>}
                    </div></div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {kind === 'invoice' && (
            <button type="button" onClick={() => setPoSheet(true)} className="flex min-h-12 w-full items-center justify-between rounded-card bg-surface-2 px-4 text-left font-medium text-brand">
              <span className="flex items-center gap-2"><Link2 size={18} aria-hidden />{effectivePo ? t('review.poChip', { po: effectivePo.poNo }) : t('review.noPo')}</span>
              <ChevronDown size={18} aria-hidden />
            </button>
          )}

          <section aria-label={t('review.lines')} className="space-y-3">
            {rows.map((r, i) => (
              <motion.div key={r.key} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32, delay: Math.min(i, 8) * 0.04 }}>
                <Card className={`space-y-3 p-4 transition-shadow ${active === i ? 'ring-2 ring-brand' : ''}`}>
                  <div className="flex items-start gap-2">
                    <Input value={r.description} onFocus={() => setActive(rowIdx(r.key))} onChange={e => patch(r.key, { description: e.target.value })} placeholder={t('review.item')} aria-label={t('review.item')} aria-invalid={touched && !r.description.trim()} />
                    <Button variant="ghost" size="icon" aria-label={t('review.removeLine')} disabled={rows.length === 1} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><Trash2 size={20} strokeWidth={1.5} /></Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><span className="mb-1 block text-xs text-ink-2">{t('review.qty')}</span><Input inputMode="numeric" value={r.qty} onFocus={() => setActive(rowIdx(r.key))} onChange={e => patch(r.key, { qty: e.target.value.replace(/\D/g, '') })} className="num" aria-invalid={touched && !/^\d+$/.test(r.qty)} /></div>
                    <div><span className="mb-1 block text-xs text-ink-2">{t('review.unit')}</span><Input value={r.unit} onFocus={() => setActive(rowIdx(r.key))} onChange={e => patch(r.key, { unit: e.target.value })} /></div>
                    <div><span className="mb-1 block text-xs text-ink-2">{t('review.price')}</span><Input inputMode="decimal" value={r.price} onFocus={() => setActive(rowIdx(r.key))} onChange={e => patch(r.key, { price: e.target.value })} className="num" aria-invalid={touched && !(kind === 'po' ? r.price === '' || isMoney(r.price) : isMoney(r.price))} /></div>
                  </div>
                </Card>
              </motion.div>
            ))}
            <Button variant="secondary" block onClick={() => { setRows(rs => [...rs, blankRow()]); }}><Plus size={18} aria-hidden />{t('review.addLine')}</Button>
          </section>

          {mismatch && (
            <div className="flex items-start gap-3 rounded-card bg-short-bg p-4 text-short" role="alert">
              <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
              <p className="num text-sm font-medium">{t('review.totalMismatch', { sum: formatMoney(sum, currency), printed: formatMoney(printedMinor!, currency) })}</p>
            </div>
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-5 pt-3" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
        <div className="mx-auto max-w-[480px]"><Button block disabled={save.isPending || loading} onClick={trySave}>{save.isPending ? t('review.saving') : t(kind === 'po' ? 'review.savePo' : 'review.saveInvoice')}</Button></div>
      </div>

      <Sheet open={supplierSheet} onOpenChange={setSupplierSheet}>
        <SheetContent title={t('review.pickSupplier')}>
          <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
            {suppliers.data?.suppliers.map(s => (
              <Button key={s.id} variant={s.id === supplierId ? 'primary' : 'secondary'} block className="h-auto justify-start py-3 text-left" onClick={() => { setSupplierId(s.id); setSupplierSheet(false); setPoPick(undefined); }}>{s.name}</Button>
            ))}
            <Button variant="ghost" block onClick={() => { setSupplierId(null); setSupplierSheet(false); }}><Plus size={18} aria-hidden />{t('review.newSupplier')}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={poSheet} onOpenChange={setPoSheet}>
        <SheetContent title={t('review.pickPo')}>
          <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
            {cands.map(c => (
              <Button key={c.id} variant={c.id === effectivePoId ? 'primary' : 'secondary'} block className="h-auto justify-between py-3 text-left" onClick={() => { setPoPick(c.id); setPoSheet(false); }}>
                <span><span className="num block">{c.poNo}</span><span className="block text-xs font-normal opacity-80">{c.supplierName}</span></span>
                {c.id === top?.id && <Badge tone="brand">{Math.round(c.score * 100)}%</Badge>}
              </Button>
            ))}
            <Button variant={effectivePoId === null ? 'primary' : 'secondary'} block onClick={() => { setPoPick(null); setPoSheet(false); }}>{t('review.noPo')}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!dup} onOpenChange={o => !o && setDup(null)}>
        <SheetContent title={t('review.dupTitle')}>
          <Button block asChild><Link href={`/invoices/${dup}/count`}>{t('review.openExisting')}</Link></Button>
        </SheetContent>
      </Sheet>
    </main>
  );
}
