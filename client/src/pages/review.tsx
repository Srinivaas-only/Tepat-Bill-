import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams, Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Globe2, Link2, ChevronDown, AlertTriangle, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { can, looksForeign, supplierOverlap } from '@shared/core';
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
import { BackButton } from '@/components/page';
import { RadioRow } from '@/components/radio-row';
import type { Box } from '@shared/schema';

interface Supplier { id: string; name: string; isForeign: boolean; country: string | null }
interface DocMeta { id: string; kind: string; width: number; height: number }
type ReadResult = { status: 'ok'; model: string; doc: ExtractedDoc } | { status: 'manual'; reason: string };
interface Candidate { id: string; score: number; poNo: string; supplierName: string; orderedAt: number }
interface DeliveryCand { id: string; doNo: string; docDate: string | null; receivedAt: number; samePo: boolean }
interface Row { key: number; description: string; qty: string; unit: string; price: string; box: Box | null }

let rowKey = 0;
const blankRow = (): Row => ({ key: ++rowKey, description: '', qty: '1', unit: '', price: '', box: null });
const label = 'mb-1 block text-sm font-medium text-ink-2';

/** The AI often returns 'RM', a currency word or nothing for ringgit; the API only knows 3-letter ISO codes. */
const normCur = (c?: string | null) => { const u = (c ?? '').trim().toUpperCase(); return !u || u === 'RM' || u === 'MYR' || u.startsWith('RINGGIT') || !/^[A-Z]{3}$/.test(u) ? 'MYR' : u; };
/** YYYY-MM-DD, D/M/YYYY, D-M-YYYY, D.M.YY -> ISO, or '' when it is not a real date. */
const normDate = (s?: string | null) => {
  const v = (s ?? '').trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v); const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(v);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; } else if (dmy) { d = +dmy[1]; m = +dmy[2]; y = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3]; } else return '';
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const normBox = (b?: number[]) => b?.length === 4 && b.every(Number.isFinite) ? (() => { const [y1, x1, y2, x2] = b.map(v => Math.max(0, Math.min(1000, Math.round(v)))); return y2 > y1 && x2 > x1 ? [y1, x1, y2, x2] as Box : null; })() : null;
const isMy = (c?: string) => !!c && ['MY', 'MYS', 'MALAYSIA'].includes(c.trim().toUpperCase());
const dmyOf = (iso: string | null, ms: number) => { const d = iso ? iso.split('-').reverse().join('/') : new Date(ms).toLocaleDateString('en-GB'); return d; };

export default function Review() {
  const params = useParams<{ kind: string; id: string }>();
  const kind: 'po' | 'invoice' | 'delivery' = params.kind === 'po' ? 'po' : params.kind === 'delivery' ? 'delivery' : 'invoice';
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
  const [seededName, setSeededName] = useState('');
  const [deliveryPick, setDeliveryPick] = useState<string | null | undefined>(undefined);
  const [deliverySheet, setDeliverySheet] = useState(false);

  useEffect(() => {
    if (seeded.current || !suppliers.data) return;
    if (isNew) { seeded.current = true; return; }
    if (!read.data) return;
    seeded.current = true;
    if (read.data.status !== 'ok') return;
    const d = read.data.doc;
    setRows(d.lines.length ? d.lines.map(l => ({ key: ++rowKey, description: l.description, qty: String(l.qty), unit: l.unit ?? '', price: l.unitPrice ?? '', box: normBox(l.box_2d) })) : [blankRow()]);
    setInvoiceNo(d.docNo ?? ''); setDocDate(normDate(d.docDate)); setCurrency(normCur(d.currency));
    setPrinted(d.totalAmount ?? ''); setCountry(isMy(d.supplierCountry) ? undefined : d.supplierCountry);
    if (normCur(d.currency) === 'USD') setRate('4.20');
    const best = suppliers.data.suppliers.map(s => ({ s, o: supplierOverlap(d.supplierName, s.name) })).sort((a, b) => b.o - a.o)[0];
    if (best && best.o >= 0.6) setSupplierId(best.s.id); else setNewName(d.supplierName);
    setSeededName(d.supplierName);
  }, [read.data, suppliers.data, isNew]);

  const supplier = suppliers.data?.suppliers.find(s => s.id === supplierId);
  const supplierName = supplier?.name ?? newName;
  const cur = normCur(currency);
  const foreignInvoice = kind === 'invoice' && cur !== 'MYR';
  const boxes = useMemo(() => rows.map(r => r.box), [rows]);
  const offerForeign = kind === 'invoice' && !foreignOk && !supplier?.isForeign && looksForeign(cur, isMy(country) ? undefined : country);

  // ---- PO suggestion (invoice + delivery)
  const sugg = useQuery({
    queryKey: ['po-sugg', supplierId, supplierName, rows.map(r => r.description).join('|')], enabled: kind !== 'po' && !!supplierName,
    queryFn: () => api.post<{ candidates: Candidate[] }>('/po-suggestions', { supplierId: supplierId ?? undefined, supplierName, lines: rows.filter(r => r.description.trim()).map(r => ({ description: r.description })) }),
  });
  const cands = sugg.data?.candidates ?? [];
  // auto-pick only when the supplier is known, or the candidate's supplier name clearly matches what was typed/read
  const top = cands[0] && cands[0].score >= 0.5 && (!!supplierId || supplierOverlap(cands[0].supplierName, supplierName) >= 0.6) ? cands[0] : undefined;
  const effectivePoId = poPick === undefined ? top?.id ?? null : poPick;
  const effectivePo = cands.find(c => c.id === effectivePoId);
  const suggLoading = kind !== 'po' && poPick === undefined && !!supplierName && (sugg.isLoading || sugg.isFetching);

  // ---- delivery suggestion (invoice only): unlinked deliveries of this supplier
  const dsugg = useQuery({
    queryKey: ['delivery-sugg', supplierId, effectivePoId], enabled: kind === 'invoice' && !!supplierId && !suggLoading,
    queryFn: () => api.post<{ deliveries: DeliveryCand[] }>('/delivery-suggestions', { supplierId, poId: effectivePoId }),
  });
  const dcands = dsugg.data?.deliveries ?? [];
  const effectiveDeliveryId = deliveryPick === undefined ? (dcands.find(c => c.samePo)?.id ?? (dcands.length === 1 ? dcands[0].id : null)) : deliveryPick;
  const effectiveDelivery = dcands.find(c => c.id === effectiveDeliveryId);
  const deliveryLoading = kind === 'invoice' && deliveryPick === undefined && !!supplierId && (suggLoading || dsugg.isLoading || dsugg.isFetching);

  // ---- validation + totals
  const unitOf = (r: Row) => toSen(r.price);
  const priceOk = (r: Row) => (kind === 'invoice' ? isMoney(r.price) : r.price === '' || isMoney(r.price));
  const rowOk = (r: Row) => r.description.trim() && /^\d+$/.test(r.qty) && priceOk(r);
  const rateOk = !foreignInvoice || toBp(rate) !== undefined;
  const invoiceOk = kind === 'po' || (invoiceNo.trim() && (kind === 'delivery' || rateOk));
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
      if (kind === 'delivery') {
        return { del: await api.post<{ id: string }>('/deliveries', { ...sup, documentId: docId ?? undefined, poId: effectivePoId, doNo: invoiceNo.trim(), docDate: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : undefined,
          lines: rows.map(r => ({ description: r.description.trim(), qty: Number(r.qty), unit: r.unit.trim() || undefined, box: r.box })) }) };
      }
      // an existing supplier confirmed as foreign: persist it before the invoice (the invoice call cannot carry it)
      if (foreignOk && supplierId && !supplier?.isForeign) await api.patch(`/suppliers/${supplierId}`, { isForeign: true, country: /^[A-Z]{2}$/.test(country ?? '') ? country : null });
      const bp = toBp(rate);
      return { inv: await api.post<{ id: string; compared?: boolean }>('/invoices', { ...sup, documentId: docId ?? undefined, poId: effectivePoId, deliveryId: effectiveDeliveryId ?? undefined, invoiceNo: invoiceNo.trim(), docDate: /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? docDate : undefined, currency: cur,
        ...(foreignInvoice ? { exchangeRateBp: bp, totalForeignMinor: printedMinor } : { totalSen: printedMinor }),
        lines: rows.map(r => ({ description: r.description.trim(), qty: Number(r.qty), unit: r.unit.trim() || undefined, box: r.box,
          ...(foreignInvoice ? { unitPriceForeignMinor: unitOf(r) } : { unitPriceSen: unitOf(r) }) })) }) };
    },
    onSuccess: r => {
      buzz(12);
      for (const k of ['suppliers', 'pos', 'invoices', 'deliveries', 'ledger', 'ledgers', 'home']) void qc.invalidateQueries({ queryKey: [k] });
      if (r.po) { toast.success(t('review.poSaved', { po: r.po.poNo })); nav('/orders', { replace: true }); }
      else if (r.del) nav(`/deliveries/${r.del.id}/count`, { replace: true });
      else nav(r.inv!.compared ? `/invoices/${r.inv!.id}/compare` : `/invoices/${r.inv!.id}/count`, { replace: true });
    },
    onError: e => {
      if (e instanceof ApiError && e.code === 'duplicate_invoice') {
        const existing = String(e.extra?.invoiceId);
        setDup(existing);
        toast.error(t('review.dupToast'), { action: { label: t('review.openExisting'), onClick: () => nav(`/invoices/${existing}`) } });
      } else if (e instanceof ApiError && e.code === 'duplicate_delivery') {
        const existing = e.extra?.deliveryId ? String(e.extra.deliveryId) : null;
        toast.error(t('review.dupDelivery'), existing ? { action: { label: t('review.openExisting'), onClick: () => nav(`/deliveries/${existing}/count`) } } : undefined);
      } else if (e instanceof ApiError && e.code === 'po_supplier_mismatch') toast.error(t('review.poOtherSupplier'));
      else toast.error(t('common.error'));
    },
  });
  const trySave = () => {
    setTouched(true);
    if (valid) save.mutate();
    else { toast.error(t('review.fillRequired')); setTimeout(() => document.querySelector('[aria-invalid=true]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50); }
  };
  const pickRow = (i: number) => { setActive(i); document.getElementById(`row-${i}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

  const patch = (key: number, p: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...p } : r)));
  const loading = suppliers.isLoading || (!isNew && !!docId && read.isLoading) || meta.isLoading;
  const rowIdx = (key: number) => rows.findIndex(r => r.key === key);

  const title = kind === 'po' ? 'review.po.title' : kind === 'delivery' ? 'review.delivery.title' : 'review.invoice.title';
  const noLabel = kind === 'delivery' ? 'review.doNo' : 'review.invoiceNo';
  const saveLabel = kind === 'po' ? 'review.savePo' : kind === 'delivery' ? 'review.saveDelivery' : 'review.saveInvoice';
  const docAlt = kind === 'po' ? 'scan.po' : kind === 'delivery' ? 'scan.bon' : 'scan.invoice';
  const showPrice = kind !== 'delivery';

  return (
    <main className="px-5 pb-36 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/scan" />
      <h1 className="mb-3 text-[28px] font-semibold leading-[34px]">{t(title)}</h1>
      {docId && meta.data && (
        <div className="sticky top-0 z-10 -mx-5 mb-4 bg-bg px-5 pb-2 pt-1"><DocImage src={`/api/documents/${docId}/file`} width={meta.data.width || 900} height={meta.data.height || 1180} alt={t(docAlt)}
          layoutId={`doc-image-${docId}`} boxes={boxes} activeIndex={active} onBoxClick={pickRow} maxHeight="28dvh" /></div>
      )}
      {(isNew || (read.data && read.data.status === 'manual')) && <p className="mb-4 rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-2">{t('review.manualNote')}</p>}

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

          {kind !== 'po' && (
            <Card className="space-y-3 p-4">
              <div><span className={label}>{t(noLabel)}</span><Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} aria-invalid={touched && !invoiceNo.trim()} /></div>
              <div className={kind === 'invoice' ? 'grid grid-cols-2 gap-3' : ''}>
                <div><span className={label}>{t('review.date')}</span><Input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} /></div>
                {kind === 'invoice' && <div><span className={label}>{t('review.currency')}</span><Input value={currency} maxLength={3} onChange={e => setCurrency(e.target.value.toUpperCase())} /></div>}
              </div>
              {foreignInvoice && (
                <div><span className={label}>{t('review.rate')}</span><Input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="4.20" aria-invalid={touched && !rateOk} className="num" /></div>
              )}
              {kind === 'invoice' && <div><span className={label}>{t('review.printedTotal')} ({currency})</span><Input inputMode="decimal" value={printed} onChange={e => setPrinted(e.target.value)} className="num" /></div>}
            </Card>
          )}

          {offerForeign && (
            <Card className="border-price/30 bg-price-bg p-4">
              <div className="flex items-start gap-3"><Globe2 size={22} className="mt-0.5 shrink-0 text-price" aria-hidden />
                <div className="flex-1"><p className="font-semibold text-price">{t('review.foreignQ')}</p><p className="text-sm text-ink-2">{t('review.foreignBody')}</p>
                  {role && can(role, 'edit_supplier') ? <Button size="sm" className="mt-3" onClick={() => setForeignOk(true)}>{t('review.foreignConfirm')}</Button> : <p className="mt-2 text-sm font-medium text-price">{t('owner.only')}</p>}
                </div></div>
            </Card>
          )}

          {kind !== 'po' && (
            suggLoading ? <Skeleton className="h-12 w-full" /> : (
              <button type="button" onClick={() => setPoSheet(true)} className="flex min-h-12 w-full items-center justify-between rounded-card bg-surface-2 px-4 text-left font-medium text-brand">
                <span className="flex items-center gap-2"><Link2 size={18} aria-hidden />{effectivePo ? t('review.poChip', { po: effectivePo.poNo }) : t('review.noPo')}</span>
                <ChevronDown size={18} aria-hidden />
              </button>
            )
          )}

          {kind === 'invoice' && !!supplierId && (
            deliveryLoading ? <Skeleton className="h-12 w-full" /> : dcands.length > 0 && (
              <button type="button" onClick={() => setDeliverySheet(true)} className="flex min-h-12 w-full items-center justify-between rounded-card bg-surface-2 px-4 text-left font-medium text-brand">
                <span className="flex min-w-0 items-center gap-2"><Truck size={18} className="shrink-0" aria-hidden /><span className="truncate">{effectiveDelivery ? t('review.deliveryChip', { do: effectiveDelivery.doNo, date: dmyOf(effectiveDelivery.docDate, effectiveDelivery.receivedAt) }) : t('review.noDelivery')}</span></span>
                <ChevronDown size={18} className="shrink-0" aria-hidden />
              </button>
            )
          )}

          <section aria-label={t('review.lines')}>
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              <p className="border-b border-dashed border-line px-5 py-2 text-[11px] font-medium uppercase tracking-[.1em] text-ink-2">{t(showPrice ? 'ledger.head.price' : 'ledger.head.qty')}</p>
              {rows.map((r, i) => (
                <div key={r.key} id={`row-${i}`} className="relative scroll-mt-[32dvh] space-y-3 border-t border-dashed border-line py-4 pl-5 pr-4 first:border-t-0">
                  {active === i && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" />}
                  <div className="flex items-start gap-2">
                    <span className="num mt-3 w-6 shrink-0 text-xs text-ink-2">{String(i + 1).padStart(2, '0')}</span>
                    <Input value={r.description} onFocus={() => setActive(rowIdx(r.key))} onChange={e => patch(r.key, { description: e.target.value })} placeholder={t('review.item')} aria-label={t('review.item')} aria-invalid={touched && !r.description.trim()} />
                    <Button variant="ghost" size="icon" aria-label={t('review.removeLine')} disabled={rows.length === 1} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><Trash2 size={20} strokeWidth={1.5} /></Button>
                  </div>
                  <div className={`grid gap-2 pl-8 ${showPrice ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <div><span className="mb-1 block text-xs text-ink-2">{t('review.qty')}</span><Input inputMode="numeric" value={r.qty} onFocus={() => setActive(rowIdx(r.key))} onChange={e => patch(r.key, { qty: e.target.value.replace(/\D/g, '') })} className="num" aria-invalid={touched && !/^\d+$/.test(r.qty)} /></div>
                    <div><span className="mb-1 block text-xs text-ink-2">{t('review.unit')}</span><Input value={r.unit} onFocus={() => setActive(rowIdx(r.key))} onChange={e => patch(r.key, { unit: e.target.value })} /></div>
                    {showPrice && <div><span className="mb-1 block text-xs text-ink-2">{t('review.price')}</span><Input inputMode="decimal" value={r.price} onFocus={() => setActive(rowIdx(r.key))} onChange={e => patch(r.key, { price: e.target.value })} className="num" aria-invalid={touched && !priceOk(r)} /></div>}
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" block className="mt-3" onClick={() => { setRows(rs => [...rs, blankRow()]); }}><Plus size={18} aria-hidden />{t('review.addLine')}</Button>
          </section>

          {mismatch && (
            <div className="flex items-start gap-3 rounded-card bg-short-bg p-4 text-short" role="alert">
              <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
              <p className="num text-sm font-medium">{t('review.totalMismatch', { sum: formatMoney(sum, currency), printed: formatMoney(printedMinor!, currency) })}</p>
            </div>
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 bg-surface pt-3" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
        <div className="mx-auto max-w-[480px] border-t border-line px-5 pt-3"><Button block disabled={save.isPending || loading || suggLoading || deliveryLoading} onClick={trySave}>{save.isPending ? t('review.saving') : t(saveLabel)}</Button></div>
      </div>

      <Sheet open={supplierSheet} onOpenChange={setSupplierSheet}>
        <SheetContent title={t('review.pickSupplier')}>
          <div role="radiogroup" aria-label={t('review.pickSupplier')} className="max-h-[50dvh] overflow-y-auto rounded-card border border-line bg-surface">
            {suppliers.data?.suppliers.map(s => (
              <RadioRow key={s.id} checked={s.id === supplierId} onClick={() => { setSupplierId(s.id); setSupplierSheet(false); setPoPick(undefined); setDeliveryPick(undefined); }}><span className="font-medium">{s.name}</span></RadioRow>
            ))}
            <RadioRow checked={supplierId === null} onClick={() => { setSupplierId(null); setNewName(n => n || seededName); setSupplierSheet(false); }}><span className="flex items-center gap-2 font-medium"><Plus size={16} aria-hidden />{t('review.newSupplier')}</span></RadioRow>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={poSheet} onOpenChange={setPoSheet}>
        <SheetContent title={t('review.pickPo')}>
          <div role="radiogroup" aria-label={t('review.pickPo')} className="max-h-[50dvh] overflow-y-auto rounded-card border border-line bg-surface">
            {cands.map(c => (
              <RadioRow key={c.id} checked={c.id === effectivePoId} onClick={() => { setPoPick(c.id); setDeliveryPick(undefined); setPoSheet(false); }}>
                <span className="flex items-center justify-between gap-2"><span><span className="num block font-medium">{c.poNo}</span><span className="block text-xs text-ink-2">{c.supplierName}</span></span>
                  {c.id === top?.id && <Badge tone="brand">{Math.round(c.score * 100)}%</Badge>}</span>
              </RadioRow>
            ))}
            <RadioRow checked={effectivePoId === null} onClick={() => { setPoPick(null); setDeliveryPick(undefined); setPoSheet(false); }}><span className="font-medium">{t('review.noPo')}</span></RadioRow>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={deliverySheet} onOpenChange={setDeliverySheet}>
        <SheetContent title={t('review.pickDelivery')}>
          <div role="radiogroup" aria-label={t('review.pickDelivery')} className="max-h-[50dvh] overflow-y-auto rounded-card border border-line bg-surface">
            {dcands.map(c => (
              <RadioRow key={c.id} checked={c.id === effectiveDeliveryId} onClick={() => { setDeliveryPick(c.id); setDeliverySheet(false); }}>
                <span className="num block font-medium">{c.doNo}</span><span className="num block text-xs text-ink-2">{dmyOf(c.docDate, c.receivedAt)}</span>
              </RadioRow>
            ))}
            <RadioRow checked={effectiveDeliveryId === null} onClick={() => { setDeliveryPick(null); setDeliverySheet(false); }}><span className="font-medium">{t('review.noDelivery')}</span></RadioRow>
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
