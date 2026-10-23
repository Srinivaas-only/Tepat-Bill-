import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { ArrowLeft, Clock } from 'lucide-react';
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
import { ErrorState } from '@/components/page';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { buzz } from '@/lib/haptics';
import { Stamp } from '@/components/stamp';
import { Money } from '@/components/ui/money';
import { LineCrop } from '@/components/line-crop';
import { PhotoViewer } from '@/components/photo-viewer';
import { statusTone, useFlagTitle, type FlagView } from '@/components/flag-card';
import { MessageSheet } from '@/components/message-sheet';
import type { Box } from '@shared/schema';

interface Detail {
  flag: FlagView & { baselineUnitSen: number | null; baselineSource: string | null; invoiceUnitSen: number | null; pricedQty: number | null };
  evidenceToken?: string;
  policyNote: string | null;
  events: { id: number; at: number; role: string; action: string }[];
  line: { lineId: string; description: string; qty: number; unit: string | null; unitPriceSen: number; box: Box | null } | null;
  receivedQty: number | null;
  invoiceDoc: { id: string; width: number; height: number } | null;
  substituteFor: { sku: string; description: string } | null;
  allowedRequests: string[];
  photos: { id: string; kind: string; url: string }[];
}
const reqKey: Record<string, Key> = { send_missing: 'flag.req.send', deduct: 'flag.req.deduct', collect_back: 'flag.req.collect', agreed_price: 'flag.req.agreed' };
const settleKey: Record<string, Key> = { redelivered: 'settle.redelivered', credit_note: 'settle.credit', deducted: 'settle.deducted' };

function Fact({ k, v }: { k: string; v: string }) {
  return <div className="flex items-baseline justify-between gap-4 py-2"><dt className="text-ink-2">{k}</dt><dd className="num text-right font-semibold">{v}</dd></div>;
}

export default function FlagDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const loc = lang === 'ms' ? 'ms-MY' : 'en-GB';
  const { role } = useAuth();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const title = useFlagTitle();
  const q = useQuery({ queryKey: ['flag', id], queryFn: () => api.get<Detail>(`/flags/${id}`) });
  const [request, setRequest] = useState<string | null>(null);
  const [agreed, setAgreed] = useState('');
  const [viewer, setViewer] = useState<string | null>(null);
  const [msg, setMsg] = useState(false);
  const [msgOpenCount, setMsgOpenCount] = useState(0);
  const openMsg = () => { setMsgOpenCount(n => n + 1); setMsg(true); };
  const [settleOpen, setSettleOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [subClosed, setSubClosed] = useState(false);
  const ledgerFn = (sid: string) => () => api.get(`/suppliers/${sid}/ledger`);
  // warm the supplier ledger so the Pay now figure is already there (and rolls) when we land on it after settling
  const sid = q.data?.flag.supplierId;
  useEffect(() => { if (sid) void qc.prefetchQuery({ queryKey: ['ledger', sid], queryFn: ledgerFn(sid) }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sid]);
  const done = async () => {
    const invId = q.data?.flag.invoiceId;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['flag', id] }), qc.invalidateQueries({ queryKey: ['flags'] }),
      qc.invalidateQueries({ queryKey: ['invoice', invId] }), qc.invalidateQueries({ queryKey: ['invoices'] }),
      qc.invalidateQueries({ queryKey: ['ledger'] }), qc.invalidateQueries({ queryKey: ['ledgers'] }), qc.invalidateQueries({ queryKey: ['home'] }),
    ]);
  };
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(`/flags/${id}/${path}`, body ?? {}),
    onSuccess: async (_r, v) => {
      if (v.path === 'approve' || v.path === 'settle') buzz(12);
      await done();
      setSettleOpen(false);
      if (v.path === 'dismiss' || v.path === 'link-substitute') nav('/flags', { replace: true });
      else if (v.path === 'settle' && sid) nav(`/suppliers/${sid}`);
    },
    onError: () => toast.error(t('common.error')),
  });
  const evLabel = (a: string) => { const k = `act.${a}` as Key; const x = t(k); return x === k ? a : x; };
  const d = q.data;
  const f = d?.flag;
  const owner = !!role && can(role, 'approve_flag');
  const proposed = f?.status === 'proposed';
  const decrease = f?.type === 'price_change' && f.direction === 'down';
  const chosen = request ?? d?.allowedRequests[0] ?? null;
  const agreedSen = toSen(agreed);

  return (
    <main className="px-5 pb-48 pt-4">
      <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={() => (history.length > 1 ? history.back() : nav('/flags'))}><ArrowLeft size={18} aria-hidden />{t('common.back')}</Button>
      {q.isError ? <ErrorState notFound onRetry={() => void q.refetch()} /> : !d || !f ? <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-[220px] w-full" /></div> : (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <motion.span layoutId={`flag-chip-${f.id}`}><Stamp key={f.status} status={f.status} thunk={f.status === 'settled'} /></motion.span>
              <span className="text-sm text-ink-2">
                <Link href={`/suppliers/${f.supplierId}`} className="font-medium text-brand">{f.supplierName}</Link> · <Link href={`/invoices/${f.invoiceId}`} className="num font-medium text-brand">{f.invoiceNo}</Link>
                {f.poNo && <> · <Link href="/orders" className="num font-medium text-brand">{f.poNo}</Link></>}
              </span>
            </div>
            <h1 className="text-2xl font-semibold leading-8">{title(f)} · {f.lineDescription}</h1>
            <p className="mt-2 text-sm text-ink-2">{t('flag.amount')}</p>
            <motion.div layoutId={`flag-amt-${f.id}`} className="inline-block"><Money sen={f.amountSen} className="text-[40px] font-semibold leading-[48px]" /></motion.div>
          </div>

          {d.invoiceDoc && <LineCrop src={`/api/documents/${d.invoiceDoc.id}/file`} width={d.invoiceDoc.width || 900} height={d.invoiceDoc.height || 1180} box={d.line?.box ?? null} onOpen={() => setViewer(`/api/documents/${d.invoiceDoc!.id}/file`)} label={t('flag.zoomHint')} />}

          <Card className="px-4 py-2"><dl className="divide-y divide-line">
            {f.type === 'short_qty' && d.line && <>
              <Fact k={t('flag.billed')} v={String(d.line.qty)} /><Fact k={t('flag.received')} v={String(d.receivedQty ?? 0)} /><Fact k={t('flag.missing')} v={String(f.missingQty ?? 0)} />
              <Fact k={t('flag.invoicePrice')} v={formatMoney(d.line.unitPriceSen, 'MYR')} />
            </>}
            {f.type === 'price_change' && <>
              <Fact k={t('flag.invoicePrice')} v={formatMoney(f.invoiceUnitSen ?? 0, 'MYR')} />
              {f.baselineUnitSen !== null && <div className="flex items-baseline justify-between gap-4 py-2"><dt className="text-ink-2">{t('flag.basePrice')} <Badge tone="price" className="ml-1">{t(`flag.src.${f.baselineSource ?? 'last_invoice'}` as Key)}</Badge></dt><dd className="num text-right font-semibold">{formatMoney(f.baselineUnitSen, 'MYR')}</dd></div>}
              <Fact k={t('flag.pricedQty')} v={String(f.pricedQty ?? 0)} />
            </>}
            {f.type === 'not_ordered' && d.line && <><Fact k={t('flag.billed')} v={String(d.line.qty)} /><Fact k={t('flag.invoicePrice')} v={formatMoney(d.line.unitPriceSen, 'MYR')} /><Fact k={t('flag.notOnPo')} v="—" /></>}
          </dl></Card>

          <section>
            <h2 className="mb-2 text-lg font-semibold">{t('flag.photos')}</h2>
            {d.photos.length === 0 ? <p className="text-ink-2">{t('flag.noPhotos')}</p> : (
              <div className="flex gap-3 overflow-x-auto pb-1">{d.photos.map(p => (
                <button key={p.id} type="button" onClick={() => setViewer(p.url)} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface-2" aria-label={t('flag.zoomHint')}><img src={p.url} alt={t('flag.photos')} className="h-full w-full object-cover" loading="lazy" /></button>
              ))}</div>
            )}
          </section>

          {d.policyNote && <Card className="bg-surface-2 px-4 py-3 shadow-none"><p className="text-xs font-semibold text-ink-2">{t('flag.policy')}</p><p className="text-sm">{d.policyNote}</p></Card>}

          {d.events.length > 0 && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">{t('flag.history')}</h2>
              <ol className="space-y-2 border-l border-line pl-4">{d.events.map(e => (
                <li key={e.id} className="relative text-sm"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-line" aria-hidden />
                  <span className="font-medium">{evLabel(e.action)}</span> <span className="num text-xs text-ink-2">{new Date(e.at).toLocaleString(loc, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>))}</ol>
            </section>
          )}

          {f.sentAt && owner && (f.status === 'open' || f.status === 'disputed') && <Badge tone="ok" className="num">{t('flag.sentOn', { date: new Date(f.sentAt).toLocaleDateString(loc) })}</Badge>}

          {proposed && !owner && <div className="space-y-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium text-ink-2"><Clock size={16} aria-hidden />{t('owner.only')}</span><p className="rounded-2xl bg-surface-2 px-4 py-3 text-ink-2">{t('flag.ownerReview')}</p></div>}

          {proposed && owner && (
            <div className="space-y-4">
              {f.type === 'not_ordered' && d.substituteFor && !subClosed && (
                <Card className="space-y-3 p-4"><p className="font-medium">{t('flag.subQ')}</p>
                  <Button variant="secondary" block className="h-auto py-3" disabled={act.isPending} onClick={() => act.mutate({ path: 'link-substitute', body: { sku: d.substituteFor!.sku } })}>{t('flag.subYes', { item: d.substituteFor.description })}</Button>
                  <Button variant="ghost" block onClick={() => setSubClosed(true)}>{t('flag.subNo')}</Button></Card>
              )}
              {f.type === 'price_change' && !decrease && (
                <Card className="space-y-3 p-4"><label className="font-medium" htmlFor="agreed">{t('flag.agreedPrice')}</label>
                  <div className="flex gap-2"><Input id="agreed" inputMode="decimal" value={agreed} onChange={e => setAgreed(e.target.value)} className="num" />
                    <Button variant="secondary" disabled={agreedSen === undefined || act.isPending} onClick={() => act.mutate({ path: 'report-price', body: { agreedSen } })}>{t('flag.useAgreed')}</Button></div></Card>
              )}
              {decrease ? <p className="rounded-2xl bg-surface-2 px-4 py-3 text-ink-2">{t('flag.decrease')}</p> : (
                <div><p className="mb-2 font-medium">{t('flag.requestLabel')}</p>
                  <div className="flex flex-col gap-2">{d.allowedRequests.map(r => (
                    <Button key={r} variant={chosen === r ? 'primary' : 'secondary'} block className="justify-start" aria-pressed={chosen === r} onClick={() => setRequest(r)}>{t(reqKey[r])}</Button>))}</div></div>
              )}
            </div>
          )}
        </div>
      )}
      {d && f && owner && (proposed || f.status === 'open' || f.status === 'disputed') && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-5 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <div className={`mx-auto max-w-[480px] gap-2 ${proposed ? "flex" : "grid grid-cols-2"}`}>
            {proposed ? <>
              {!decrease && <Button className="flex-1" disabled={act.isPending} onClick={() => act.mutate({ path: 'approve', body: { request: chosen } })}>{t('flag.approve')}</Button>}
              <Button variant="ghost" className="flex-1 bg-surface-2" disabled={act.isPending} onClick={() => setDismissOpen(true)}>{t('flag.dismissFull')}</Button>
            </> : <>
              <Button className="col-span-2" onClick={openMsg}>{!f.sentAt ? t('flag.send') : f.reminderDue ? t('flag.remind') : t('flag.resend')}</Button>
              {f.status === 'open'
                ? <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ path: 'dispute' })}>{t('flag.dispute')}</Button>
                : <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ path: 'reopen' })}>{t('flag.reopen')}</Button>}
              <Button variant="secondary" onClick={() => setSettleOpen(true)}>{t('flag.settle')}</Button>
            </>}
          </div>
        </div>
      )}
      {f && (
        <Sheet open={settleOpen} onOpenChange={setSettleOpen}>
          <SheetContent title={t('flag.settleSheet')} description={t('flag.settleQ')}>
            <div className="space-y-2">{(f.type === 'short_qty' ? ['redelivered', 'credit_note', 'deducted'] as const : ['credit_note', 'deducted'] as const).map(sv => (
              <Button key={sv} variant="secondary" block className="justify-start" disabled={act.isPending} onClick={() => act.mutate({ path: 'settle', body: { settlement: sv } })}>{t(settleKey[sv])}</Button>))}</div>
          </SheetContent>
        </Sheet>
      )}
      <Sheet open={dismissOpen} onOpenChange={setDismissOpen}>
        <SheetContent title={t('flag.dismissQ')} description={t('flag.dismissFull')}>
          <div className="space-y-2">
            <Button block variant="destructive" disabled={act.isPending} onClick={() => { setDismissOpen(false); act.mutate({ path: 'dismiss' }); }}>{t('flag.dismissFull')}</Button>
            <Button block variant="secondary" onClick={() => setDismissOpen(false)}>{t('common.cancel')}</Button>
          </div>
        </SheetContent>
      </Sheet>
      {f && <MessageSheet key={msgOpenCount} flagId={f.id} open={msg} onOpenChange={setMsg} reminder={f.reminderDue} />}
      <PhotoViewer src={viewer} onClose={() => setViewer(null)} />
    </main>
  );
}
