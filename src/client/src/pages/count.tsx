import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Camera, Check, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can, type FulfilmentRow } from '@shared/core';
import { BackButton, ErrorState, SectionLabel } from '@/components/page';
import { Stamp } from '@/components/stamp';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useI18n } from '@/i18n';
import { prepareFile, uploadDocument } from '@/lib/image';
import { buzz } from '@/lib/haptics';
import { Button } from '@/components/ui/button';
import { FixedBar } from '@/components/fixed-bar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { FlagLedger, type FlagView } from '@/components/flag-card';

interface RawDetail {
  invoice: { id: string; invoiceNo: string; supplierName: string; poNo: string | null };
  lines: { lineId: string; description: string; qty: number; unit: string | null; matchedSku: string | null }[];
  poOnly: { sku: string; description: string; orderedQty: number }[];
  counts: Record<string, number>; hasCounts: boolean; countSources?: Record<string, string>;
  photos: { id: string; photoKind: string | null; kind: string }[];
  flags: FlagView[];
}

interface Detail {
  fulfilment?: FulfilmentRow[] | null; delState?: string; ref: string; supplierName: string; poNo: string | null;
  lines: { lineId: string; description: string; qty: number; unit: string | null }[];
  poOnly: { sku: string; description: string; orderedQty: number }[];
  counts: Record<string, number>; sources: Record<string, string>;
  photos: { id: string; photoKind: string | null; kind: string }[];
  flags: FlagView[];
}
interface RawDelivery {
  delivery: { id: string; doNo: string; supplierName: string; poNo: string | null; state?: string };
  lines: { lineId: string; description: string; qty: number; unit: string | null; receivedQty: number }[];
  flags: FlagView[]; photos: { id: string; photoKind: string | null; kind: string }[];
  fulfilment?: FulfilmentRow[] | null;
}

function Stepper({ value, onChange, max = 100000, decLabel, incLabel, hand, label }: { label: string; hand?: boolean; value: number; onChange: (n: number) => void; max?: number; decLabel: string; incLabel: string }) {
  // long-press repeat: starts after 400ms, then every 120ms
  const valRef = useRef(value); valRef.current = value;
  const timers = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval>; fired: boolean; stepped: boolean }>({ fired: false, stepped: false });
  const clamp = (n: number) => Math.max(0, Math.min(max, n));
  const stop = () => { clearTimeout(timers.current.t); clearInterval(timers.current.i); };
  const apply = (d: number) => { const n = clamp(valRef.current + d); if (n === valRef.current) { stop(); return; } valRef.current = n; if (!timers.current.stepped) { timers.current.stepped = true; buzz(6); } onChange(n); };
  const start = (d: number) => { stop(); timers.current.fired = false; timers.current.stepped = false; timers.current.t = setTimeout(() => { timers.current.fired = true; timers.current.i = setInterval(() => apply(d), 120); }, 400); };
  useEffect(() => stop, []);
  const press = (d: number) => ({
    onPointerDown: () => start(d), onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
    onClick: () => { if (timers.current.fired) { timers.current.fired = false; return; } timers.current.stepped = false; apply(d); },
  });
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full" aria-label={decLabel} disabled={value <= 0} {...press(-1)}><Minus size={22} /></Button>
      <input inputMode="numeric" aria-label={label} value={value} onFocus={e => e.currentTarget.select()} onChange={e => onChange(clamp(Number(e.target.value.replace(/\D/g, '')) || 0))}
        className={`h-12 w-14 bg-transparent text-center ${hand ? 'rounded-none border-0 border-b-2 border-brand/40 text-[30px] font-normal text-brand-text' : 'num rounded-btn border border-line-strong/70 bg-surface text-[26px] font-semibold'}`} style={hand ? { fontFamily: "'Kalam', cursive" } : undefined} />
      <Button variant="secondary" size="icon" className="h-12 w-12 rounded-full" aria-label={incLabel} {...press(1)}><Plus size={22} /></Button>
    </div>
  );
}

function ExtraList({ extras }: { extras: { id: string; description: string; n: number }[] }) {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      {extras.map(x => <div key={x.id} className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0"><p className="font-medium leading-5">{x.description}</p><span className="num shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-sm font-semibold text-dispute">+{x.n}</span></div>)}
    </div>
  );
}

export default function Count({ mode = 'invoice' }: { mode?: 'invoice' | 'delivery' }) {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { role } = useAuth();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const isDel = mode === 'delivery';
  const base = isDel ? `/deliveries/${id}` : `/invoices/${id}`;
  const qkey = ['count', isDel ? 'delivery' : 'invoice', id]; // own cache entry: invoice-detail caches a different shape under ['invoice', id]
  const q = useQuery({
    queryKey: qkey, refetchOnMount: 'always',
    queryFn: async (): Promise<Detail> => {
      if (isDel) {
        const r = await api.get<RawDelivery>(base);
        return { fulfilment: r.fulfilment, delState: r.delivery.state, ref: r.delivery.doNo, supplierName: r.delivery.supplierName, poNo: r.delivery.poNo, lines: r.lines, poOnly: [], flags: r.flags, photos: r.photos,
          counts: Object.fromEntries(r.lines.map(l => [`line:${l.lineId}`, l.receivedQty])), sources: {} };
      }
      const r = await api.get<RawDetail>(base);
      return { ref: r.invoice.invoiceNo, supplierName: r.invoice.supplierName, poNo: r.invoice.poNo, lines: r.lines, poOnly: r.poOnly, counts: r.counts, sources: r.countSources ?? {}, photos: r.photos, flags: r.flags };
    },
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ flags: FlagView[]; processed: boolean; sen: number; extras: { id: string; description: string; n: number }[] } | null>(null);
  const [shown, setShown] = useState(0);
  const seeded = useRef(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');
  const delivery = useRef<HTMLInputElement>(null);
  const bon = useRef<HTMLInputElement>(null);
  useEffect(() => { if (q.data && !seeded.current) { seeded.current = true; setCounts(q.data.counts); } }, [q.data]);

  const refresh = () => { for (const k of ['flags', 'flag', 'home', 'ledger', 'ledgers', 'deliveries', 'invoices', 'invoice', 'delivery']) void qc.invalidateQueries({ queryKey: [k] }); void qc.invalidateQueries({ queryKey: qkey }); };
  const save = useMutation({
    mutationFn: (o: { all?: boolean; reason?: string } = {}) => api.put<{ flags: FlagView[]; totalSen?: number; estimateSen?: number }>(`${base}/counts`, { counts, confirmed: o.all ? 'all' : [...touched], ...(o.reason ? { reason: o.reason } : {}) }),
    onSuccess: r => {
      buzz(14); setShown(0);
      const open = r.flags.filter(f => f.status === 'proposed' && !f.supersededBy && (f.type !== 'price_change' || f.direction !== 'down'));
      const processed = open.length === 0 && r.flags.some(f => f.status !== 'proposed' && f.status !== 'dismissed');
      const extras = (q.data?.lines ?? []).map(l => ({ id: l.lineId, description: l.description, n: (counts[`line:${l.lineId}`] ?? l.qty) - l.qty })).filter(x => x.n > 0);
      setResult({ flags: open, processed, sen: r.estimateSen ?? r.totalSen ?? 0, extras });
      refresh();
    },
    onError: e => {
      if (e instanceof ApiError && e.code === 'reason_required') { setReasonOpen(true); return; }
      toast.error(e instanceof ApiError && e.code === 'owner_review_required' ? t('count.ownerOnly') : t('common.error'));
    },
  });
  const markCorrect = useMutation({
    mutationFn: () => api.post(`${base}/mark-correct`),
    onSuccess: () => { refresh(); toast.success(t('delivery.allGood')); nav('/', { replace: true }); },
    onError: e => toast.error(e instanceof ApiError && e.status === 409 ? t('flag.alreadyDone') : t('common.error')),
  });
  const photo = useMutation({
    mutationFn: async ({ file, photoKind }: { file: File; photoKind: 'delivery' | 'signed_bon' }) => {
      const p = await prepareFile(file);
      return uploadDocument(p, { kind: photoKind === 'signed_bon' ? 'delivery_note' : 'photo', photoKind, ...(isDel ? { deliveryId: id } : { invoiceId: id }) });
    },
    onSuccess: refresh,
    onError: () => toast.error(t('count.photoFail')),
  });

  const set = (key: string, n: number) => { setTouched(x => new Set(x).add(key)); setCounts(c => ({ ...c, [key]: n })); };
  const d = q.data;
  const isUncounted = (key: string) => !isDel && !touched.has(key) && !!d && key in d.counts && (d?.sources[key] ?? 'default') === 'default';
  const liveExtras = d ? d.lines.filter(l => (counts[`line:${l.lineId}`] ?? l.qty) > l.qty).length : 0;
  const uncounted = d ? d.lines.filter(l => isUncounted(`line:${l.lineId}`)).length : 0;
  useEffect(() => { if (!result) return; const tm = setTimeout(() => setShown(result.sen), 250); return () => clearTimeout(tm); }, [result]);
  const thumb = (kind: string) => [...(d?.photos ?? [])].reverse().find(p => p.photoKind === kind)?.id;
  const hasBon = d?.photos.some(p => p.photoKind === 'signed_bon');
  const hasDelivery = d?.photos.some(p => p.photoKind === 'delivery');
  const billedLabel = t(isDel ? 'count.deliveredLabel' : 'count.billedLabel');
  const title = t(isDel ? 'delivery.count.title' : 'count.title');

  return (
    <main className="px-5 pb-36 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/" />
      <h1 className="page-title">{title}</h1>
      {d && <p className="mb-5 mt-1 text-ink-2"><span className="num">{d.ref}</span> · {d.supplierName}{d.poNo ? ` · ${d.poNo}` : ''}</p>}
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} notFound={q.error instanceof ApiError && q.error.status === 404} /> : !d ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[112px] w-full" />)}</div> : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <p className="flex items-center justify-between border-b border-line px-5 py-2 eyebrow"><span>{t('ledger.head.count')}</span>{d.lines.some(l => (counts[`line:${l.lineId}`] ?? l.qty) !== l.qty) && <span className="num normal-case tracking-normal text-short">{t('count.summary', { n: d.lines.filter(l => (counts[`line:${l.lineId}`] ?? l.qty) !== l.qty).length, m: d.lines.length })}</span>}</p>
            {d.lines.map((l, i) => {
              const key = `line:${l.lineId}`; const v = counts[key] ?? l.qty; const diff = l.qty - v;
              return (
                <div key={l.lineId} className="relative border-t border-line py-4 pl-5 pr-4 first:border-t-0">
                  {diff !== 0 && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-short" />}
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex gap-2 font-medium leading-5"><span className="num w-6 shrink-0 text-xs leading-5 text-ink-2">{String(i + 1).padStart(2, '0')}</span><span>{l.description}</span></p>
                    {diff !== 0 ? <Badge tone="short" className="num shrink-0">{diff > 0 ? '−' : '+'}{Math.abs(diff)}</Badge> : isUncounted(key) && <Badge tone="neutral" className="shrink-0">{t('count.uncounted')}</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <p className="pl-8 text-sm text-ink-2">{billedLabel} <span className="num">{l.qty}{l.unit ? ` ${l.unit}` : ''}</span></p>
                    <Stepper hand={diff !== 0} value={v} onChange={n => set(key, n)} label={`${t('review.qty')} · ${l.description}`} decLabel={t('count.dec')} incLabel={t('count.inc')} />
                  </div>
                </div>
              );
            })}
            {d.poOnly.map(p => (
              <div key={p.sku} className="border-t border-line py-4 pl-5 pr-4">
                <p className="font-medium leading-5">{p.description}</p>
                <p className="mt-1 text-sm text-ink-2"><span className="eyebrow">{t('count.orderedCaption')}</span> <span className="num">{p.orderedQty}</span> · {t('count.ordered')}</p>
                <div className="mt-3 flex justify-end">
                  <Stepper value={counts[p.sku] ?? 0} onChange={n => set(p.sku, n)} label={`${t('review.qty')} · ${p.description}`} decLabel={t('count.dec')} incLabel={t('count.inc')} />
                </div>
              </div>
            ))}
          </div>

          {isDel && d.fulfilment && d.fulfilment.length > 0 && (
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              <p className="border-b border-line px-5 py-2 eyebrow">{t('fulfil.title')}</p>
              {d.fulfilment.map(r => (
                <div key={r.sku} className="flex items-start justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                  <div className="min-w-0"><p className="font-medium leading-5">{r.description}</p>
                    <p className="num text-xs text-ink-2">{t('fulfil.row', { o: r.ordered, d: r.delivered, r: r.received })}{r.billed > 0 ? ` · ${t('fulfil.billed', { n: r.billed })}` : ''}</p>
                    {r.billedNotReceived > 0 && <p className="text-xs text-short">{t('fulfil.billedNotReceived', { n: r.billedNotReceived })}</p>}</div>
                  <Badge tone={r.status === 'complete' ? 'ok' : r.status === 'over' ? 'dispute' : 'short'} className="num shrink-0">{r.status === 'complete' ? t('fulfil.complete') : r.status === 'over' ? t('fulfil.over') : r.status === 'partial' ? t('fulfil.partial', { n: r.outstanding }) : t('fulfil.notDelivered', { n: r.outstanding })}</Badge>
                </div>))}
            </div>
          )}

          {liveExtras > 0 && <p className="rounded-card bg-surface p-4 text-sm font-medium text-dispute shadow-card">{t('count.extraTitle')}: {t(isDel ? 'count.extraBodyDel' : 'count.extraBody')}</p>}

          {isDel && d.delState === 'confirm' && liveExtras === 0 && role && can(role, 'mark_correct') && (
            <div className="rounded-card bg-surface p-4 shadow-card space-y-2">
              <p className="font-semibold">{t('delivery.confirmCardTitle')}</p>
              <p className="text-sm text-ink-2">{t('delivery.confirmCardBody')}</p>
              <Button block disabled={markCorrect.isPending} onClick={() => markCorrect.mutate()}>{t('delivery.confirm')}</Button>
            </div>
          )}

          <section className="pt-2">
            <SectionLabel>{t('count.photos')}</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {([['delivery', hasDelivery, delivery, Camera, 'count.addDelivery'], ['signed_bon', hasBon, bon, Truck, 'count.addBon']] as const).map(([kind, done, ref, Icon, key]) => (
                <div key={kind}>
                  <input ref={ref} type="file" accept="image/*" {...(kind === 'delivery' ? { capture: 'environment' as const } : {})} className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) photo.mutate({ file: f, photoKind: kind }); }} />
                  <Button variant="secondary" block className="h-auto flex-col gap-1 whitespace-normal px-3 py-4 text-center leading-5" disabled={photo.isPending} onClick={() => ref.current?.click()}>
                    {done && thumb(kind) ? <img src={`/api/documents/${thumb(kind)}/file`} alt={t(key)} className="h-10 w-10 rounded-[10px] object-cover" /> : done ? <Check size={22} className="text-ok" aria-hidden /> : <Icon size={22} strokeWidth={1.5} aria-hidden />}<span className="text-sm">{t(key)}</span>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <FixedBar><Button block disabled={!d || save.isPending || photo.isPending} onClick={() => uncounted > 0 ? setConfirmOpen(true) : save.mutate({})}>{save.isPending ? t('count.saving') : t('count.save')}</Button></FixedBar>

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent title={t('count.confirmTitle', { n: uncounted })}>
          <div className="space-y-3">
            <p className="text-ink-2">{t('count.confirmBody')}</p>
            <Button block onClick={() => { setConfirmOpen(false); save.mutate({ all: true }); }}>{t('count.confirmAll')}</Button>
            <Button block variant="ghost" onClick={() => setConfirmOpen(false)}>{t('count.confirmBack')}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={reasonOpen} onOpenChange={setReasonOpen}>
        <SheetContent title={t('count.reasonTitle')}>
          <div className="space-y-3">
            <p className="text-ink-2">{t('count.reasonBody')}</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={300} rows={3} aria-label={t('count.reasonTitle')} placeholder={t('count.reasonPlaceholder')} className="w-full rounded-btn border border-line bg-surface p-3 text-base focus-visible:border-brand" />
            <Button block disabled={reason.trim().length < 3 || save.isPending} onClick={() => { setReasonOpen(false); save.mutate({ all: true, reason: reason.trim() }); }}>{t('count.reasonSubmit')}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!result} onOpenChange={() => undefined}>
        <SheetContent title={t('count.resultTitle')} onInteractOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          {result && (result.processed ? (
            <div className="stagger space-y-4">
              <p className="text-ink-2">{t(isDel ? 'count.processedDelivery' : 'count.processed')}</p>
              <Button block onClick={() => nav('/flags', { replace: true })}>{t('count.view')}</Button>
              <Button block variant="ghost" onClick={() => setResult(null)}>{t('count.done')}</Button>
            </div>
          ) : result.flags.length === 0 && result.extras.length > 0 ? (
            <div className="stagger space-y-4">
              <h2 className="text-xl font-semibold leading-6">{t('count.extraTitle')}</h2>
              <ExtraList extras={result.extras} />
              <p className="text-ink-2">{t(isDel ? 'count.extraBodyDel' : 'count.extraBody')}</p>
              <Button block onClick={() => nav('/', { replace: true })}>{t('count.done')}</Button>
            </div>
          ) : result.flags.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <Stamp status="ok" thunk label={t(isDel ? 'delivery.allGood' : 'count.allGood')} />
              <p className="text-ink-2">{t(isDel ? 'delivery.allGoodBody' : 'count.allGoodBody')}</p>
              {isDel && role && can(role, 'mark_correct') && <Button block disabled={markCorrect.isPending} onClick={() => markCorrect.mutate()}>{t('delivery.confirm')}</Button>}
              <Button block variant={isDel && role && can(role, 'mark_correct') ? 'secondary' : 'primary'} onClick={() => nav('/', { replace: true })}>{t('count.done')}</Button>
            </div>
          ) : (
            <div className="stagger space-y-4">
              <div>
                <h2 className="text-xl font-semibold leading-6">{t('count.diffs', { n: result.flags.length })}</h2>
                <p className="mt-1 flex items-baseline gap-2">{isDel && <span className="text-sm text-ink-2">{t('flag.estimate', { rm: '' }).trim()}</span>}<span className="inline-block"><Money sen={shown} animate className="text-[32px] font-semibold leading-10" /></span></p>
              </div>
              {result.extras.length > 0 && <><h3 className="text-base font-semibold">{t('count.extraTitle')}</h3><ExtraList extras={result.extras} /><p className="text-sm text-ink-2">{t(isDel ? 'count.extraBodyDel' : 'count.extraBody')}</p></>}
              <FlagLedger flags={result.flags} onPick={f => { nav('/flags', { replace: true }); nav('/flags/' + f.id); }} />
              <Button block onClick={() => nav('/flags', { replace: true })}>{t('count.view')}</Button>
            </div>
          ))}
        </SheetContent>
      </Sheet>
    </main>
  );
}
