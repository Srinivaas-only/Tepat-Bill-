import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Camera, Check, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@shared/core';
import { BackButton, ErrorState, SectionLabel } from '@/components/page';
import { Stamp } from '@/components/stamp';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useI18n } from '@/i18n';
import { prepareFile, uploadDocument } from '@/lib/image';
import { buzz } from '@/lib/haptics';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { FlagLedger, type FlagView } from '@/components/flag-card';

interface RawDetail {
  invoice: { id: string; invoiceNo: string; supplierName: string; poNo: string | null };
  lines: { lineId: string; description: string; qty: number; unit: string | null; matchedSku: string | null }[];
  poOnly: { sku: string; description: string; orderedQty: number }[];
  counts: Record<string, number>; hasCounts: boolean;
  photos: { id: string; photoKind: string | null; kind: string }[];
  flags: FlagView[];
}

interface Detail {
  ref: string; supplierName: string; poNo: string | null;
  lines: { lineId: string; description: string; qty: number; unit: string | null }[];
  poOnly: { sku: string; description: string; orderedQty: number }[];
  counts: Record<string, number>;
  photos: { id: string; photoKind: string | null; kind: string }[];
  flags: FlagView[];
}
interface RawDelivery {
  delivery: { id: string; doNo: string; supplierName: string; poNo: string | null };
  lines: { lineId: string; description: string; qty: number; unit: string | null; receivedQty: number }[];
  flags: FlagView[]; photos: { id: string; photoKind: string | null; kind: string }[];
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
      <Button variant="secondary" size="icon" className="h-14 w-14 rounded-full" aria-label={decLabel} disabled={value <= 0} {...press(-1)}><Minus size={22} /></Button>
      <input inputMode="numeric" aria-label={label} value={value} onFocus={e => e.currentTarget.select()} onChange={e => onChange(clamp(Number(e.target.value.replace(/\D/g, '')) || 0))}
        className={`h-14 w-16 bg-transparent text-center ${hand ? 'rounded-none border-0 border-b-2 border-brand/40 text-[32px] font-normal text-brand' : 'num rounded-btn border border-line bg-surface text-[28px] font-semibold'}`} style={hand ? { fontFamily: "'Kalam', cursive" } : undefined} />
      <Button variant="secondary" size="icon" className="h-14 w-14 rounded-full" aria-label={incLabel} {...press(1)}><Plus size={22} /></Button>
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
  const qkey = [isDel ? 'delivery' : 'invoice', id];
  const q = useQuery({
    queryKey: qkey, refetchOnMount: 'always',
    queryFn: async (): Promise<Detail> => {
      if (isDel) {
        const r = await api.get<RawDelivery>(base);
        return { ref: r.delivery.doNo, supplierName: r.delivery.supplierName, poNo: r.delivery.poNo, lines: r.lines, poOnly: [], flags: r.flags, photos: r.photos,
          counts: Object.fromEntries(r.lines.map(l => [`line:${l.lineId}`, l.receivedQty])) };
      }
      const r = await api.get<RawDetail>(base);
      return { ref: r.invoice.invoiceNo, supplierName: r.invoice.supplierName, poNo: r.invoice.poNo, lines: r.lines, poOnly: r.poOnly, counts: r.counts, photos: r.photos, flags: r.flags };
    },
  });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ flags: FlagView[]; processed: boolean; sen: number } | null>(null);
  const [shown, setShown] = useState(0);
  const seeded = useRef(false);
  const delivery = useRef<HTMLInputElement>(null);
  const bon = useRef<HTMLInputElement>(null);
  useEffect(() => { if (q.data && !seeded.current) { seeded.current = true; setCounts(q.data.counts); } }, [q.data]);

  const refresh = () => { for (const k of ['flags', 'flag', 'home', 'ledger', 'ledgers', 'deliveries', 'invoices']) void qc.invalidateQueries({ queryKey: [k] }); void qc.invalidateQueries({ queryKey: qkey }); };
  const save = useMutation({
    mutationFn: () => api.put<{ flags: FlagView[]; totalSen?: number; estimateSen?: number }>(`${base}/counts`, { counts }),
    onSuccess: r => {
      buzz(14); setShown(0);
      const open = r.flags.filter(f => f.status === 'proposed' && !f.supersededBy && (f.type !== 'price_change' || f.direction !== 'down'));
      const processed = open.length === 0 && r.flags.some(f => f.status !== 'proposed' && f.status !== 'dismissed');
      setResult({ flags: open, processed, sen: r.estimateSen ?? r.totalSen ?? 0 });
      refresh();
    },
    onError: () => toast.error(t('common.error')),
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

  const set = (key: string, n: number) => setCounts(c => ({ ...c, [key]: n }));
  const d = q.data;
  useEffect(() => { if (!result) return; const tm = setTimeout(() => setShown(result.sen), 250); return () => clearTimeout(tm); }, [result]);
  const thumb = (kind: string) => [...(d?.photos ?? [])].reverse().find(p => p.photoKind === kind)?.id;
  const hasBon = d?.photos.some(p => p.photoKind === 'signed_bon');
  const hasDelivery = d?.photos.some(p => p.photoKind === 'delivery');
  const billedLabel = t(isDel ? 'count.deliveredLabel' : 'count.billedLabel');
  const title = t(isDel ? 'delivery.count.title' : 'count.title');

  return (
    <main className="px-5 pb-36 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/" />
      <h1 className="text-[28px] font-semibold leading-[34px]">{title}</h1>
      {d && <p className="mb-5 mt-1 text-ink-2"><span className="num">{d.ref}</span> · {d.supplierName}{d.poNo ? ` · ${d.poNo}` : ''}</p>}
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} notFound={q.error instanceof ApiError && q.error.status === 404} /> : !d ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[112px] w-full" />)}</div> : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <p className="border-b border-dashed border-line px-5 py-2 text-[11px] font-medium uppercase tracking-[.1em] text-ink-2">{t('ledger.head.count')}</p>
            {d.lines.map((l, i) => {
              const key = `line:${l.lineId}`; const v = counts[key] ?? l.qty; const diff = l.qty - v;
              return (
                <div key={l.lineId} className="relative border-t border-dashed border-line py-4 pl-5 pr-4 first:border-t-0">
                  {diff !== 0 && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-short" />}
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex gap-2 font-medium leading-5"><span className="num w-6 shrink-0 text-xs leading-5 text-ink-2">{String(i + 1).padStart(2, '0')}</span><span>{l.description}</span></p>
                    {diff !== 0 && <Badge tone="short" className="num shrink-0">{diff > 0 ? '−' : '+'}{Math.abs(diff)}</Badge>}
                  </div>
                  <p className="mt-1 pl-8 text-sm text-ink-2">{billedLabel} <span className="num">{l.qty}{l.unit ? ` ${l.unit}` : ''}</span></p>
                  <div className="mt-3 flex justify-end">
                    <Stepper hand={diff !== 0} value={v} onChange={n => set(key, n)} label={`${t('review.qty')} · ${l.description}`} decLabel={t('count.dec')} incLabel={t('count.inc')} />
                  </div>
                </div>
              );
            })}
            {d.poOnly.map(p => (
              <div key={p.sku} className="border-t border-dashed border-line py-4 pl-5 pr-4">
                <p className="font-medium leading-5">{p.description}</p>
                <p className="mt-1 text-sm text-ink-2"><span className="text-[11px] font-medium uppercase tracking-[.08em]">{t('count.orderedCaption')}</span> <span className="num">{p.orderedQty}</span> · {t('count.ordered')}</p>
                <div className="mt-3 flex justify-end">
                  <Stepper value={counts[p.sku] ?? 0} onChange={n => set(p.sku, n)} label={`${t('review.qty')} · ${p.description}`} decLabel={t('count.dec')} incLabel={t('count.inc')} />
                </div>
              </div>
            ))}
          </div>

          <section className="pt-2">
            <SectionLabel>{t('count.photos')}</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {([['delivery', hasDelivery, delivery, Camera, 'count.addDelivery'], ['signed_bon', hasBon, bon, Truck, 'count.addBon']] as const).map(([kind, done, ref, Icon, key]) => (
                <div key={kind}>
                  <input ref={ref} type="file" accept="image/*" {...(kind === 'delivery' ? { capture: 'environment' as const } : {})} className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) photo.mutate({ file: f, photoKind: kind }); }} />
                  <Button variant="secondary" block className="h-auto flex-col gap-1 whitespace-normal px-3 py-4 text-center leading-5" disabled={photo.isPending} onClick={() => ref.current?.click()}>
                    {done && thumb(kind) ? <img src={`/api/documents/${thumb(kind)}/file`} alt={t(key)} className="h-10 w-10 rounded-lg object-cover" /> : done ? <Check size={22} className="text-ok" aria-hidden /> : <Icon size={22} strokeWidth={1.5} aria-hidden />}<span className="text-sm">{t(key)}</span>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 bg-surface pt-3" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
        <div className="mx-auto max-w-[480px] border-t border-line px-5 pt-3"><Button block disabled={!d || save.isPending || photo.isPending} onClick={() => save.mutate()}>{save.isPending ? t('count.saving') : t('count.save')}</Button></div>
      </div>

      <Sheet open={!!result} onOpenChange={() => undefined}>
        <SheetContent title={t('count.resultTitle')} onInteractOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          {result && (result.processed ? (
            <div className="space-y-4">
              <p className="text-ink-2">{t(isDel ? 'count.processedDelivery' : 'count.processed')}</p>
              <Button block onClick={() => nav('/flags', { replace: true })}>{t('count.view')}</Button>
              <Button block variant="ghost" onClick={() => setResult(null)}>{t('count.done')}</Button>
            </div>
          ) : result.flags.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <Stamp status="ok" thunk label={t(isDel ? 'delivery.allGood' : 'count.allGood')} />
              <p className="text-ink-2">{t(isDel ? 'delivery.allGoodBody' : 'count.allGoodBody')}</p>
              {isDel && role && can(role, 'mark_correct') && <Button block disabled={markCorrect.isPending} onClick={() => markCorrect.mutate()}>{t('delivery.confirm')}</Button>}
              <Button block variant={isDel && role && can(role, 'mark_correct') ? 'secondary' : 'primary'} onClick={() => nav('/', { replace: true })}>{t('count.done')}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold leading-6">{t('count.diffs', { n: result.flags.length })}</h2>
                <p className="mt-1 flex items-baseline gap-2">{isDel && <span className="text-sm text-ink-2">{t('flag.estimate', { rm: '' }).trim()}</span>}<span className="inline-block border-b-[3px] border-double border-ink pb-1"><Money sen={shown} animate className="text-[32px] font-semibold leading-10" /></span></p>
              </div>
              <FlagLedger flags={result.flags} onPick={f => { nav('/flags', { replace: true }); nav('/flags/' + f.id); }} />
              <Button block onClick={() => nav('/flags', { replace: true })}>{t('count.view')}</Button>
            </div>
          ))}
        </SheetContent>
      </Sheet>
    </main>
  );
}
