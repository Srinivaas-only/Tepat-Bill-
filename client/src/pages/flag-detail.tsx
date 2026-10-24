import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronRight, Clock, Copy, ExternalLink } from 'lucide-react';
import { can } from '@shared/core';
import { api, ApiError } from '@/lib/api';
import { fmtDate } from '@/lib/dates';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { formatMoney, toSen } from '@/lib/money-input';
import { Button } from '@/components/ui/button';
import { FixedBar } from '@/components/fixed-bar';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { RadioRow } from '@/components/radio-row';
import { Badge } from '@/components/ui/badge';
import { ErrorState, BackButton, SectionLabel } from '@/components/page';
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
  flag: FlagView & { note?: string | null; baselineUnitSen: number | null; baselineSource: string | null; invoiceUnitSen: number | null; pricedQty: number | null };
  evidenceToken?: string;
  policyNote: string | null;
  events: { id: number; at: number; role: string; action: string }[];
  line: { lineId: string; description: string; qty: number; unit: string | null; unitPriceSen: number; box: Box | null } | null;
  receivedQty: number | null;
  invoiceDoc: { id: string; width: number; height: number } | null;
  substituteFor: { sku: string; description: string } | null;
  allowedRequests: string[];
  poOptions?: { sku: string; description: string; orderedQty: number }[];
  delivery?: { id: string; doNo: string; invoiceId: string | null } | null;
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
  const q = useQuery({ queryKey: ['flag', id], refetchOnWindowFocus: true, queryFn: () => api.get<Detail>(`/flags/${id}`) });
  const [justStamped, setJustStamped] = useState(false);
  const navTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(navTimer.current), []);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [request, setRequest] = useState<string | null>(null);
  const [agreed, setAgreed] = useState('');
  const [viewer, setViewer] = useState<string | null>(null);
  const [msg, setMsg] = useState(false);
  const [msgOpenCount, setMsgOpenCount] = useState(0);
  const openMsg = () => { setMsgOpenCount(n => n + 1); setMsg(true); };
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleKind, setSettleKind] = useState<'credit_note' | 'deducted' | null>(null);
  useEffect(() => { if (!settleOpen) setSettleKind(null); }, [settleOpen]);
  const [acceptedRM, setAcceptedRM] = useState('');
  const [settleRef, setSettleRef] = useState('');
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
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post<{ dismissed?: boolean }>(`/flags/${id}/${path}`, body ?? {}),
    onMutate: async v => {
      // stamp first: it must already be armed when the status flips and the Stamp remounts (otherwise the thunk never plays)
      if (v.path === 'approve' || v.path === 'settle' || v.path === 'dispute') { setJustStamped(true); buzz(12); }
      const optimistic: Record<string, string> = { approve: 'open', settle: 'settled' };
      if (!optimistic[v.path]) return { prev: undefined };
      await qc.cancelQueries({ queryKey: ['flag', id] });
      const prev = qc.getQueryData<Detail>(['flag', id]);
      if (prev) qc.setQueryData<Detail>(['flag', id], { ...prev, flag: { ...prev.flag, status: optimistic[v.path] } });
      return { prev };
    },
    onSuccess: async (r, v) => {
      await done();
      setSettleOpen(false); setDisputeOpen(false);
      if (v.path === 'report-price' && r.dismissed) { toast.success(t('flag.priceSame')); nav('/flags', { replace: true }); return; }
      if (v.path === 'dismiss' || v.path === 'link-substitute') nav('/flags', { replace: true });
      else if (v.path === 'settle') { window.scrollTo({ top: 0, behavior: 'smooth' }); if (sid) navTimer.current = setTimeout(() => nav(`/suppliers/${sid}`), 900); }
      else if (v.path === 'approve' || v.path === 'dispute') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e, _v, ctx) => {
      setJustStamped(false);
      if (ctx?.prev) qc.setQueryData(['flag', id], ctx.prev);
      if (e instanceof ApiError && e.status === 409) { void q.refetch(); void qc.invalidateQueries({ queryKey: ['flags'] }); toast.error(t('flag.alreadyDone'), { position: 'top-center' }); }
      else toast.error(t('common.error'), { position: 'top-center' });
    },
  });
  const copyLink = async () => { try { await navigator.clipboard.writeText(`${location.origin}/e/${q.data!.evidenceToken}`); toast.success(t('flag.linkCopied'), { position: 'top-center' }); } catch { toast.error(t('common.error')); } };
  const evLabel = (a: string) => { const k = `act.${a}` as Key; const x = t(k); return x === k ? t('act.unknown') : x; };
  const d = q.data;
  const f = d?.flag;
  const owner = !!role && can(role, 'approve_flag');
  const proposed = f?.status === 'proposed';
  const decrease = f?.type === 'price_change' && f.direction === 'down';
  const chosen = request ?? d?.allowedRequests[0] ?? null;
  const agreedSen = toSen(agreed);

  return (
    <main className="px-5 pb-56 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/flags" />
      {q.isError ? <ErrorState notFound onRetry={() => void q.refetch()} /> : !d || !f ? <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-[220px] w-full" /></div> : (
        <div className="stagger space-y-4">
          <div>
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm text-ink-2">
                <Link href={`/suppliers/${f.supplierId}`} className="flex min-h-11 items-center truncate font-semibold text-brand-text">{f.supplierName}</Link>
                <div className="-mt-1 flex flex-wrap items-center">
                  <Link href={f.stage === 'delivery' && f.deliveryId ? `/deliveries/${f.deliveryId}/count` : `/invoices/${f.invoiceId}`} className="num inline-flex min-h-11 items-center font-medium text-brand-text">{f.invoiceNo}</Link>
                  {f.poNo && <><span aria-hidden className="mx-2">·</span><Link href={f.poId ? `/orders/po/${f.poId}` : '/orders'} className="num inline-flex min-h-11 items-center font-medium text-brand-text">{f.poNo}</Link></>}
                </div>
              </div>
              {f.supersededBy ? <Badge tone="neutral" className="mt-3 shrink-0">{t('flag.broughtToInvoice')}</Badge> : <span className="mt-3 shrink-0"><Stamp key={f.status} status={f.status} thunk={justStamped} /></span>}
            </div>
            {f.supersededBy && (
              <Link href={`/flags/${f.supersededBy}`} className="press mb-3 flex min-h-11 items-center justify-between rounded-card border border-line-strong/60 px-4 text-sm font-semibold text-brand-text">{t('flag.viewReplacing')}<ChevronRight size={16} aria-hidden /></Link>
            )}
            <h1 className="page-title">{title(f)} · {f.lineDescription}</h1>
            <p className="mt-2 text-sm text-ink-2">{f.stage === 'delivery' ? t('flag.estimate', { rm: '' }).trim() : t('flag.amount')}</p>
            <div className="inline-block"><span className="inline-block"><Money sen={f.amountSen} className="text-[40px] font-semibold leading-[48px]" /></span></div>
          </div>

          {d.invoiceDoc && <LineCrop src={`/api/documents/${d.invoiceDoc.id}/file`} width={d.invoiceDoc.width || 900} height={d.invoiceDoc.height || 1180} box={d.line?.box ?? null} onOpen={() => setViewer(`/api/documents/${d.invoiceDoc!.id}/file`)} label={t('flag.zoomHint')} />}

          <Card className="px-4 py-2"><dl className="divide-y divide-line">
            {f.type === 'short_qty' && d.line && <>
              <Fact k={t(f.stage === 'delivery' ? 'flag.onBon' : 'flag.billed')} v={String(d.line.qty)} /><Fact k={t('flag.received')} v={String(d.receivedQty ?? 0)} /><Fact k={t('flag.missing')} v={String(f.missingQty ?? 0)} />
              {f.stage !== 'delivery' && <Fact k={t('flag.invoicePrice')} v={formatMoney(d.line.unitPriceSen, 'MYR')} />}
            </>}
            {f.type === 'price_change' && <>
              <Fact k={t('flag.invoicePrice')} v={formatMoney(f.invoiceUnitSen ?? 0, 'MYR')} />
              {f.baselineUnitSen !== null && <div className="flex items-baseline justify-between gap-4 py-2"><dt className="text-ink-2">{t('flag.basePrice')} <Badge tone="price" className="ml-1">{t(`flag.src.${f.baselineSource ?? 'last_invoice'}` as Key)}</Badge></dt><dd className="num text-right font-semibold">{formatMoney(f.baselineUnitSen, 'MYR')}</dd></div>}
              {f.baselineUnitSen !== null && f.baselineSource !== 'agreed' && <p className="py-2 text-sm text-dispute">{t('flag.unverified')}</p>}
              <Fact k={t('flag.pricedQty')} v={String(f.pricedQty ?? 0)} />
            </>}
            {f.type === 'not_ordered' && d.line && <><Fact k={t('flag.billed')} v={String(d.line.qty)} /><Fact k={t('flag.invoicePrice')} v={formatMoney(d.line.unitPriceSen, 'MYR')} /><Fact k={t('flag.notOnPo')} v="—" /></>}
          </dl></Card>

          <section>
            <SectionLabel>{t('flag.photos')}</SectionLabel>
            {d.photos.length === 0 ? <p className="text-ink-2">{t('flag.noPhotos')}</p> : (
              <div className="flex gap-3 overflow-x-auto pb-1">{d.photos.map(p => (
                <button key={p.id} type="button" onClick={() => setViewer(p.url)} className="h-24 w-24 shrink-0 overflow-hidden rounded-card bg-surface-2" aria-label={t('flag.zoomHint')}><img src={p.url} alt={`${t('flag.photos')} ${p.kind}`} className="h-full w-full object-cover" loading="lazy" /></button>
              ))}</div>
            )}
          </section>

          {d.policyNote && <Card className="bg-surface-2 px-4 py-3"><p className="text-xs font-semibold text-ink-2">{t('flag.policy')}</p><p className="text-sm">{d.policyNote}</p></Card>}

          {d.events.length > 0 && (
            <section>
              <SectionLabel>{t('flag.history')}</SectionLabel>
              <ol className="space-y-3 border-l border-line-strong/40 pl-5">{d.events.map(e => (
                <li key={e.id} className="relative text-sm"><span className="absolute -left-[31px] top-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ok-bg text-ok ring-4 ring-bg" aria-hidden><Check size={11} strokeWidth={3} /></span>
                  <span className="font-medium">{evLabel(e.action)}</span> <span className="num text-xs text-ink-2">{`${fmtDate(e.at, lang)} ${new Date(e.at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}`}</span></li>))}</ol>
            </section>
          )}

          {f.sentAt && owner && (f.status === 'open' || f.status === 'disputed') && <Badge tone="neutral" className="num">{t('flag.sentOn', { date: fmtDate(f.sentAt, lang) })}</Badge>}
          {f.needsRecheck && <Card className="px-4 py-3"><p className="text-sm font-medium text-dispute">{t('flag.recheck')}</p></Card>}
          {f.status === 'settled' && f.acceptedSen != null && <Card className="px-4 py-3"><p className="eyebrow">{t('flag.acceptedLabel')}</p><p className="text-sm"><span className="num font-semibold">{formatMoney(f.acceptedSen, 'MYR')}</span>{f.settlementRef ? ` · ${f.settlementRef}` : ''}</p></Card>}
          {f.childFlagId && <Card className="px-4 py-3"><Link href={`/flags/${f.childFlagId}`} className="block"><p className="text-sm font-medium text-dispute">{t('flag.residueOpen', { rm: formatMoney(f.amountSen - (f.acceptedSen ?? f.amountSen), 'MYR') })}</p><p className="text-xs text-ink-2">{t('flag.residueLink')}</p></Link></Card>}
          {f.parentFlagId && <Card className="px-4 py-3"><Link href={`/flags/${f.parentFlagId}`} className="block"><p className="text-sm font-medium">{t('flag.residueOf')}</p></Link></Card>}
          {f.reminderDue && <p className="text-sm font-medium text-dispute">{t('flag.reminderCaption')}</p>}
          {f.note && <Card className="px-4 py-3"><p className="eyebrow">{t('flag.noteLabel')}</p><p className="text-sm">{f.note}</p></Card>}
          {owner && f.status !== 'proposed' && d.evidenceToken && (
            <div className="flex flex-wrap gap-x-4">
              <a href={`/e/${d.evidenceToken}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-text"><ExternalLink size={16} aria-hidden />{t('flag.viewEvidence')}</a>
              <button type="button" onClick={copyLink} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-text"><Copy size={16} aria-hidden />{t('flag.copyLink')}</button>
            </div>
          )}

          {proposed && !owner && <div className="space-y-2"><span className="inline-flex items-center gap-1.5 rounded-[4px] border border-line px-2 py-1 text-sm font-medium text-ink-2"><Clock size={16} aria-hidden />{t('owner.only')}</span><p className="rounded-card bg-surface-2 px-4 py-3 text-ink-2">{t('flag.ownerReview')}</p></div>}

          {proposed && owner && (
            <div className="stagger space-y-4">
              {f.type === 'not_ordered' && !d.substituteFor && (d.poOptions?.length ?? 0) > 0 && f.stage !== 'delivery' && (
                <Card className="space-y-2 p-4"><p className="font-medium">{t('flag.subQ')}</p>
                  <div role="radiogroup" aria-label={t('flag.linkPo')} className="overflow-hidden rounded-card border border-line">{d.poOptions!.map(o => <RadioRow key={o.sku} checked={false} onClick={() => act.mutate({ path: 'link-substitute', body: { sku: o.sku } })}><span className="text-sm font-medium">{o.description}</span></RadioRow>)}</div></Card>
              )}
              {f.type === 'not_ordered' && d.substituteFor && !subClosed && (
                <Card className="space-y-3 p-4"><p className="font-medium">{t('flag.subQ')}</p>
                  <Button variant="secondary" block className="h-auto py-3" disabled={act.isPending} onClick={() => act.mutate({ path: 'link-substitute', body: { sku: d.substituteFor!.sku } })}>{t('flag.subYes', { item: d.substituteFor.description })}</Button>
                  <Button variant="ghost" block onClick={() => setSubClosed(true)}>{t('flag.subNo')}</Button></Card>
              )}
              {f.type === 'price_change' && !decrease && (
                <Card className="space-y-3 p-4"><label className="font-medium" htmlFor="agreed">{t('flag.agreedPrice')}</label>
                  <div className="grid grid-cols-[1fr_auto] gap-2"><div className="relative"><span className="num pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden>RM</span><Input id="agreed" inputMode="decimal" value={agreed} onChange={e => setAgreed(e.target.value)} className="num pl-12" /></div>
                    <Button variant="secondary" disabled={agreedSen === undefined || act.isPending} onClick={() => act.mutate({ path: 'report-price', body: { agreedSen } })}>{t('flag.useAgreed')}</Button></div>
                  {f.direction === 'up' && <Button variant="ghost" block disabled={act.isPending} onClick={() => act.mutate({ path: 'dismiss', body: { asInflation: true } })}>{t('flag.inflation')}</Button>}</Card>
              )}
              {decrease ? <p className="rounded-card bg-surface-2 px-4 py-3 text-ink-2">{t('flag.decrease')}</p> : (
                <div><p className="mb-2 font-medium">{t('flag.requestLabel')}</p>
                  <div role="radiogroup" aria-label={t('flag.requestLabel')} className="overflow-hidden rounded-card bg-surface shadow-card">{d.allowedRequests.map(r => (
                    <RadioRow key={r} checked={chosen === r} onClick={() => setRequest(r)}><span className="font-medium">{t(reqKey[r])}</span></RadioRow>))}</div></div>
              )}
            </div>
          )}
        </div>
      )}
      {d && f && owner && !f.supersededBy && (proposed || f.status === 'open' || f.status === 'disputed') && (
        <FixedBar className={`gap-2 ${proposed ? "flex" : "grid grid-cols-2"}`}>
          <>
            {proposed ? <>
              {!decrease && <Button variant="secondary" className="flex-1" onClick={openMsg}>{t('flag.previewDraft')}</Button>}
              {!decrease && <Button className="flex-1" disabled={act.isPending} onClick={() => act.mutate({ path: 'approve', body: { request: chosen } })}>{t('flag.approve')}</Button>}
              <Button variant="secondary" className="flex-1" disabled={act.isPending} onClick={() => setDismissOpen(true)}>{t('flag.dismissFull')}</Button>
            </> : <>
              {!f.parentFlagId && <Button className="col-span-2" onClick={openMsg}>{!f.sentAt ? t('flag.send') : f.reminderDue ? t('flag.remind') : t('flag.resend')}</Button>}
              {f.status === 'open'
                ? <Button variant="secondary" disabled={act.isPending} onClick={() => setDisputeOpen(true)}>{t('flag.dispute')}</Button>
                : <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ path: 'reopen' })}>{t('flag.reopen')}</Button>}
              <Button variant="secondary" onClick={() => setSettleOpen(true)}>{t('flag.settle')}</Button>
            </>}
          </>
        </FixedBar>
      )}
      {f && (
        <Sheet open={settleOpen} onOpenChange={o => { setSettleOpen(o); if (!o) setSettleKind(null); }}>
          <SheetContent title={t('flag.settleSheet')} description={t('flag.settleQ')}>
            {settleKind === null ? (
              <div className="space-y-2">{(f.type === 'short_qty' ? ['redelivered', 'credit_note', 'deducted'] as const : ['credit_note', 'deducted'] as const).map(sv => (
                <Button key={sv} variant="secondary" block className="justify-start" disabled={act.isPending} onClick={() => {
                  if (sv === 'redelivered' || f.stage === 'delivery') act.mutate({ path: 'settle', body: { settlement: sv } });
                  else { setSettleKind(sv); setAcceptedRM((f.amountSen / 100).toFixed(2)); setSettleRef(''); }
                }}>{t(settleKey[sv])}</Button>))}</div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-2">{t('flag.acceptHelp', { rm: formatMoney(f.amountSen, 'MYR') })}</p>
                <div><label htmlFor="acc" className="mb-1 block text-sm font-medium text-ink-2">{t('flag.acceptedAmount')}</label>
                  <div className="relative"><span className="num pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden>RM</span><Input id="acc" inputMode="decimal" value={acceptedRM} onChange={e => setAcceptedRM(e.target.value)} className="num pl-12" /></div></div>
                <div><label htmlFor="ref" className="mb-1 block text-sm font-medium text-ink-2">{t('flag.acceptedRef')}</label>
                  <Input id="ref" value={settleRef} maxLength={80} onChange={e => setSettleRef(e.target.value)} placeholder={t('flag.acceptedRefPh')} /></div>
                <Button block disabled={act.isPending || toSen(acceptedRM) === undefined || (toSen(acceptedRM) ?? 0) > f.amountSen}
                  onClick={() => act.mutate({ path: 'settle', body: { settlement: settleKind, acceptedSen: toSen(acceptedRM), ...(settleRef.trim() ? { ref: settleRef.trim() } : {}) } })}>{t('flag.acceptConfirm')}</Button>
                <Button block variant="ghost" onClick={() => setSettleKind(null)}>{t('common.back')}</Button>
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}
      <Sheet open={disputeOpen} onOpenChange={setDisputeOpen}>
        <SheetContent title={t('flag.disputeTitle')}>
          <div className="space-y-3">
            <label htmlFor="dnote" className="block text-sm font-medium text-ink-2">{t('flag.disputeNote')}</label>
            <textarea id="dnote" value={disputeNote} onChange={e => setDisputeNote(e.target.value)} rows={4} maxLength={500} className="w-full rounded-btn border border-line bg-surface p-3 text-base focus-visible:border-brand" />
            <Button block disabled={act.isPending} onClick={() => act.mutate({ path: 'dispute', body: disputeNote.trim() ? { note: disputeNote.trim() } : {} })}>{t('flag.disputeConfirm')}</Button>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={dismissOpen} onOpenChange={setDismissOpen}>
        <SheetContent title={t('flag.dismissQ')} description={t('flag.dismissBody')}>
          <div className="space-y-2">
            <Button block variant="destructive" disabled={act.isPending} onClick={() => { setDismissOpen(false); act.mutate({ path: 'dismiss' }); }}>{t('flag.dismissFull')}</Button>
            <Button block variant="secondary" onClick={() => setDismissOpen(false)}>{t('common.cancel')}</Button>
          </div>
        </SheetContent>
      </Sheet>
      {f && <MessageSheet key={msgOpenCount} flagId={f.id} open={msg} onOpenChange={setMsg} reminder={f.reminderDue} request={proposed ? chosen ?? undefined : undefined} />}
      <PhotoViewer src={viewer} onClose={() => setViewer(null)} />
    </main>
  );
}
