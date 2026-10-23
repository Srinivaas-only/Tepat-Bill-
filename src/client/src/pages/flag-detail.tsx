import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { can } from '@shared/core';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { formatMoney, toSen } from '@/lib/money-input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { LineCrop } from '@/components/line-crop';
import { PhotoViewer } from '@/components/photo-viewer';
import { useFlagTitle, type FlagView } from '@/components/flag-card';
import { MessageSheet } from '@/components/message-sheet';
import type { Box } from '@shared/schema';

interface Detail {
  flag: FlagView & { baselineUnitSen: number | null; baselineSource: string | null; invoiceUnitSen: number | null; pricedQty: number | null };
  evidenceToken?: string;
  line: { lineId: string; description: string; qty: number; unit: string | null; unitPriceSen: number; box: Box | null } | null;
  receivedQty: number | null;
  invoiceDoc: { id: string; width: number; height: number } | null;
  substituteFor: { sku: string; description: string } | null;
  allowedRequests: string[];
  photos: { id: string; kind: string; url: string }[];
}
const reqKey: Record<string, Key> = { send_missing: 'flag.req.send', deduct: 'flag.req.deduct', collect_back: 'flag.req.collect', agreed_price: 'flag.req.agreed' };
const settleKey: Record<string, Key> = { redelivered: 'settle.redelivered', credit_note: 'settle.credit', deducted: 'settle.deducted' };
const tone = { proposed: 'brand', open: 'price', disputed: 'dispute', settled: 'ok', dismissed: 'neutral' } as const;

function Fact({ k, v }: { k: string; v: string }) {
  return <div className="flex items-baseline justify-between gap-4 py-2"><dt className="text-ink-2">{k}</dt><dd className="tnum text-right font-semibold">{v}</dd></div>;
}

export default function FlagDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { role } = useAuth();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const title = useFlagTitle();
  const q = useQuery({ queryKey: ['flag', id], queryFn: () => api.get<Detail>(`/flags/${id}`) });
  const [request, setRequest] = useState<string | null>(null);
  const [agreed, setAgreed] = useState('');
  const [viewer, setViewer] = useState<string | null>(null);
  const [msg, setMsg] = useState(false);
  const done = () => { void qc.invalidateQueries({ queryKey: ['flag', id] }); void qc.invalidateQueries({ queryKey: ['flags'] }); void qc.invalidateQueries({ queryKey: ['ledger'] }); void qc.invalidateQueries({ queryKey: ['ledgers'] }); };
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(`/flags/${id}/${path}`, body ?? {}),
    onSuccess: (_r, v) => { done(); if (v.path === 'dismiss') nav('/flags', { replace: true }); },
    onError: () => toast.error(t('common.error')),
  });
  const d = q.data;
  const f = d?.flag;
  const owner = !!role && can(role, 'approve_flag');
  const proposed = f?.status === 'proposed';
  const decrease = f?.type === 'price_change' && f.direction === 'down';
  const chosen = request ?? d?.allowedRequests[0] ?? null;
  const agreedSen = toSen(agreed);

  return (
    <main className="px-5 pb-36 pt-4">
      <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={() => (history.length > 1 ? history.back() : nav('/flags'))}><ArrowLeft size={18} aria-hidden />{t('common.back')}</Button>
      {!d || !f ? <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-[220px] w-full" /></div> : (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center gap-2"><Badge tone={tone[f.status as keyof typeof tone]}>{t(`status.${f.status}` as Key)}</Badge><span className="text-sm text-ink-2">{f.supplierName} · <span className="tnum">{f.invoiceNo}</span></span></div>
            <h1 className="text-2xl font-semibold leading-8">{title(f)} · {f.lineDescription}</h1>
            <p className="mt-2 text-sm text-ink-2">{t('flag.amount')}</p>
            <Money sen={f.amountSen} className="text-[40px] font-semibold leading-[48px]" />
          </div>

          {d.invoiceDoc && <LineCrop src={`/api/documents/${d.invoiceDoc.id}/file`} width={d.invoiceDoc.width || 900} height={d.invoiceDoc.height || 1180} box={d.line?.box ?? null} onOpen={() => setViewer(`/api/documents/${d.invoiceDoc!.id}/file`)} label={t('flag.zoomHint')} />}

          <Card className="px-4 py-2"><dl className="divide-y divide-line">
            {f.type === 'short_qty' && d.line && <>
              <Fact k={t('flag.billed')} v={String(d.line.qty)} /><Fact k={t('flag.received')} v={String(d.receivedQty ?? 0)} /><Fact k={t('flag.missing')} v={String(f.missingQty ?? 0)} />
              <Fact k={t('flag.invoicePrice')} v={formatMoney(d.line.unitPriceSen, 'MYR')} />
            </>}
            {f.type === 'price_change' && <>
              <Fact k={t('flag.invoicePrice')} v={formatMoney(f.invoiceUnitSen ?? 0, 'MYR')} />
              {f.baselineUnitSen !== null && <Fact k={`${t('flag.basePrice')} (${t(`flag.src.${f.baselineSource ?? 'last_invoice'}` as Key)})`} v={formatMoney(f.baselineUnitSen, 'MYR')} />}
              <Fact k={t('flag.pricedQty')} v={String(f.pricedQty ?? 0)} />
            </>}
            {f.type === 'not_ordered' && d.line && <><Fact k={t('flag.billed')} v={String(d.line.qty)} /><Fact k={t('flag.invoicePrice')} v={formatMoney(d.line.unitPriceSen, 'MYR')} /><Fact k={t('flag.notOnPo')} v="—" /></>}
          </dl></Card>

          <section>
            <h2 className="mb-2 text-lg font-semibold">{t('flag.photos')}</h2>
            {d.photos.length === 0 ? <p className="text-ink-2">{t('flag.noPhotos')}</p> : (
              <div className="flex gap-3 overflow-x-auto pb-1">{d.photos.map(p => (
                <button key={p.id} type="button" onClick={() => setViewer(p.url)} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface-2" aria-label={t('flag.zoomHint')}><img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" /></button>
              ))}</div>
            )}
          </section>

          {owner && (f.status === 'open' || f.status === 'disputed') && (
            <div className="space-y-2">
              {f.sentAt && <p className="text-sm text-ink-2">{t('flag.sentOn', { date: new Date(f.sentAt).toLocaleDateString('en-GB') })}</p>}
              <Button block onClick={() => setMsg(true)}>{f.sentAt ? t('flag.remind') : t('flag.send')}</Button>
              {f.status === 'open'
                ? <Button variant="secondary" block disabled={act.isPending} onClick={() => act.mutate({ path: 'dispute' })}>{t('flag.dispute')}</Button>
                : <Button variant="secondary" block disabled={act.isPending} onClick={() => act.mutate({ path: 'reopen' })}>{t('flag.reopen')}</Button>}
              <p className="pt-2 font-medium">{t('flag.settleQ')}</p>
              {(f.type === 'short_qty' ? ['redelivered', 'credit_note', 'deducted'] as const : ['credit_note', 'deducted'] as const).map(s => (
                <Button key={s} variant="ghost" block className="justify-start bg-surface-2" disabled={act.isPending} onClick={() => act.mutate({ path: 'settle', body: { settlement: s } })}>{t(settleKey[s])}</Button>))}
            </div>
          )}

          {proposed && !owner && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-ink-2">{t('flag.ownerReview')}</p>}

          {proposed && owner && (
            <div className="space-y-4">
              {f.type === 'not_ordered' && d.substituteFor && (
                <Card className="space-y-3 p-4"><p className="font-medium">{t('flag.subQ')}</p>
                  <Button variant="secondary" block className="h-auto py-3" disabled={act.isPending} onClick={() => act.mutate({ path: 'link-substitute', body: { sku: d.substituteFor!.sku } })}>{t('flag.subYes', { item: d.substituteFor.description })}</Button></Card>
              )}
              {f.type === 'price_change' && !decrease && (
                <Card className="space-y-3 p-4"><label className="font-medium" htmlFor="agreed">{t('flag.agreedPrice')}</label>
                  <div className="flex gap-2"><Input id="agreed" inputMode="decimal" value={agreed} onChange={e => setAgreed(e.target.value)} className="tnum" />
                    <Button variant="secondary" disabled={agreedSen === undefined || act.isPending} onClick={() => act.mutate({ path: 'report-price', body: { agreedSen } })}>{t('flag.useAgreed')}</Button></div></Card>
              )}
              {decrease ? <p className="rounded-2xl bg-surface-2 px-4 py-3 text-ink-2">{t('flag.decrease')}</p> : (
                <div><p className="mb-2 font-medium">{t('flag.requestLabel')}</p>
                  <div className="flex flex-col gap-2">{d.allowedRequests.map(r => (
                    <Button key={r} variant={chosen === r ? 'primary' : 'secondary'} block className="justify-start" aria-pressed={chosen === r} onClick={() => setRequest(r)}>{t(reqKey[r])}</Button>))}</div></div>
              )}
              <div className="space-y-2">
                {!decrease && <Button block disabled={act.isPending} onClick={() => act.mutate({ path: 'approve', body: { request: chosen } })}>{t('flag.approve')}</Button>}
                <Button variant="ghost" block disabled={act.isPending} onClick={() => act.mutate({ path: 'dismiss' })}>{t('flag.dismissFull')}</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {f && <MessageSheet flagId={f.id} open={msg} onOpenChange={setMsg} reminder={!!f.sentAt} />}
      <PhotoViewer src={viewer} onClose={() => setViewer(null)} />
    </main>
  );
}
