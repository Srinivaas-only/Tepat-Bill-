import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Minus, Plus, Camera, Check, Truck, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { prepareFile, uploadDocument } from '@/lib/image';
import { buzz } from '@/lib/haptics';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { FlagCard, type FlagView } from '@/components/flag-card';

interface Detail {
  invoice: { id: string; invoiceNo: string; supplierName: string; poNo: string | null };
  lines: { lineId: string; description: string; qty: number; unit: string | null; matchedSku: string | null }[];
  poOnly: { sku: string; description: string; orderedQty: number }[];
  counts: Record<string, number>; hasCounts: boolean;
  photos: { id: string; photoKind: string | null; kind: string }[];
  flags: FlagView[];
}

function Stepper({ value, onChange, max = 100000, decLabel, incLabel }: { value: number; onChange: (n: number) => void; max?: number; decLabel: string; incLabel: string }) {
  const step = (d: number) => { buzz(6); onChange(Math.max(0, Math.min(max, value + d))); };
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="icon" aria-label={decLabel} onClick={() => step(-1)} disabled={value <= 0}><Minus size={20} /></Button>
      <input inputMode="numeric" aria-label="qty" value={value} onChange={e => onChange(Math.min(max, Number(e.target.value.replace(/\D/g, '')) || 0))}
        className="tnum h-12 w-16 rounded-btn border border-line bg-surface text-center text-xl font-semibold" />
      <Button variant="secondary" size="icon" aria-label={incLabel} onClick={() => step(1)}><Plus size={20} /></Button>
    </div>
  );
}

export default function Count() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Detail>(`/invoices/${id}`) });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [result, setResult] = useState<FlagView[] | null>(null);
  const seeded = useRef(false);
  const delivery = useRef<HTMLInputElement>(null);
  const bon = useRef<HTMLInputElement>(null);
  useEffect(() => { if (q.data && !seeded.current) { seeded.current = true; setCounts(q.data.counts); } }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.put<{ flags: FlagView[] }>(`/invoices/${id}/counts`, { counts }),
    onSuccess: r => { buzz(14); setResult(r.flags.filter(f => f.type !== 'price_change' || f.direction !== 'down')); void qc.invalidateQueries({ queryKey: ['flags'] }); void qc.invalidateQueries({ queryKey: ['invoice', id] }); },
    onError: () => toast.error(t('common.error')),
  });
  const photo = useMutation({
    mutationFn: async ({ file, photoKind }: { file: File; photoKind: 'delivery' | 'signed_bon' }) => {
      const p = await prepareFile(file);
      return uploadDocument(p, { kind: photoKind === 'signed_bon' ? 'delivery_note' : 'photo', photoKind, invoiceId: id });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['invoice', id] }),
    onError: () => toast.error(t('count.photoFail')),
  });

  const set = (key: string, n: number) => setCounts(c => ({ ...c, [key]: n }));
  const d = q.data;
  const total = result?.reduce((a, f) => a + f.amountSen, 0) ?? 0;
  const hasBon = d?.photos.some(p => p.photoKind === 'signed_bon');
  const hasDelivery = d?.photos.some(p => p.photoKind === 'delivery');

  return (
    <main className="px-5 pb-36 pt-6">
      <h1 className="text-[28px] font-semibold leading-[34px]">{t('count.title')}</h1>
      {d && <p className="mb-5 mt-1 text-ink-2"><span className="tnum">{d.invoice.invoiceNo}</span> · {d.invoice.supplierName}{d.invoice.poNo ? ` · ${d.invoice.poNo}` : ''}</p>}
      {!d ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[112px] w-full" />)}</div> : (
        <div className="space-y-3">
          {d.lines.map((l, i) => {
            const key = `line:${l.lineId}`; const v = counts[key] ?? l.qty;
            return (
              <motion.div key={l.lineId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32, delay: Math.min(i, 8) * 0.04 }}>
                <Card className="p-4">
                  <p className="font-medium leading-5">{l.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="tnum text-sm text-ink-2">{t('count.billed', { n: `${l.qty}${l.unit ? ` ${l.unit}` : ''}` })}</span>
                    <Stepper value={v} onChange={n => set(key, n)} decLabel={t('count.dec')} incLabel={t('count.inc')} />
                  </div>
                </Card>
              </motion.div>
            );
          })}
          {d.poOnly.map(p => (
            <Card key={p.sku} className="p-4">
              <p className="font-medium leading-5">{p.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-ink-2">{t('count.ordered')}</span>
                <Stepper value={counts[p.sku] ?? 0} onChange={n => set(p.sku, n)} decLabel={t('count.dec')} incLabel={t('count.inc')} />
              </div>
            </Card>
          ))}

          <section className="pt-2">
            <h2 className="mb-2 text-lg font-semibold">{t('count.photos')}</h2>
            <div className="grid grid-cols-2 gap-3">
              {([['delivery', hasDelivery, delivery, Camera, 'count.addDelivery'], ['signed_bon', hasBon, bon, Truck, 'count.addBon']] as const).map(([kind, done, ref, Icon, key]) => (
                <div key={kind}>
                  <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) photo.mutate({ file: f, photoKind: kind }); }} />
                  <Button variant="secondary" block className="h-auto flex-col gap-1 py-4" disabled={photo.isPending} onClick={() => ref.current?.click()}>
                    {done ? <Check size={22} className="text-ok" aria-hidden /> : <Icon size={22} strokeWidth={1.5} aria-hidden />}<span className="text-sm">{t(key)}</span>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 px-5 pt-3 backdrop-blur-xl" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
        <div className="mx-auto max-w-[480px]"><Button block disabled={!d || save.isPending} onClick={() => save.mutate()}>{save.isPending ? t('count.saving') : t('count.save')}</Button></div>
      </div>

      <AnimatePresence>
        {result && (
          <motion.div className="fixed inset-0 z-50 flex items-end bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div role="dialog" aria-modal="true" aria-label={t('count.save')} initial={{ y: reduce ? 0 : 400 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              className="mx-auto max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-bg p-5" style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}>
              {result.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <motion.div initial={{ scale: 0.6 }} animate={{ scale: [0.6, 1.06, 1] }} transition={{ duration: 0.45 }} className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-bg text-ok"><Check size={26} aria-hidden /></motion.div>
                  <h2 className="text-2xl font-semibold">{t('count.allGood')}</h2><p className="text-ink-2">{t('count.allGoodBody')}</p>
                  <Button block onClick={() => nav('/', { replace: true })}>{t('count.done')}</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-notord-bg text-notord"><TriangleAlert size={24} aria-hidden /></div>
                    <div><h2 className="text-xl font-semibold leading-6">{t('count.diffs', { n: result.length })}</h2><Money sen={total} animate className="text-[32px] font-semibold leading-10" /></div>
                  </div>
                  <div className="space-y-2">{result.map((f, i) => <FlagCard key={f.id} flag={f} index={i} />)}</div>
                  <Button block onClick={() => nav('/flags', { replace: true })}>{t('count.view')}</Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
