import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ScanLine } from 'lucide-react';
import { can } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import type { Key } from '@/i18n/ms';
import { fmtDate } from '@/lib/dates';
import { Page, ErrorState, EmptyState, SectionLabel } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { FlagLedger, type FlagView } from '@/components/flag-card';

interface Home {
  summary: { flaggedSen: number; settledSen: number; openSen: number };
  needsActionCount: number; needsAction: FlagView[]; followUpCount: number; followUps: FlagView[];
  credits: { id: string; name: string; creditSen: number }[]; recent: { id: number; at: number; role: string; action: string; ref: string | null }[];
  deliveries: { id: string; doNo: string; supplierName: string; receivedAt: number; invoiceId: string | null; state: 'issue' | 'billed' | 'correct' | 'waiting' }[];
  checksLeft: number; firstRun: boolean;
}
const delTone = { issue: 'short', correct: 'ok', waiting: 'neutral', billed: 'neutral' } as const;

function Section({ title, count, flags }: { title: string; count: number; flags: FlagView[] }) {
  const { t } = useI18n();
  if (flags.length === 0) return null;
  return (
    <section className="mt-6">
      <SectionLabel count={count}>{title}</SectionLabel>
      {count > flags.length && <Link href="/flags" className="-mt-1 mb-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand">{t('home.more')}</Link>}
      <FlagLedger flags={flags} />
    </section>
  );
}

interface InvToday { id: string; invoiceNo: string; supplierName: string; totalSen: number; issuedAt: number }

function StaffHome() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['invoices', 'today'], refetchOnMount: 'always', queryFn: () => api.get<{ invoices: InvToday[] }>('/invoices') });
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = (q.data?.invoices ?? []).filter(i => i.issuedAt >= start.getTime());
  return (
    <Page title={t('app.name')}>
      <Button block asChild className="h-16 text-lg"><Link href="/scan"><ScanLine size={24} aria-hidden />{t('home.recordDelivery')}</Link></Button>
      <section className="mt-6">
        <SectionLabel>{t('home.todayInvoices')}</SectionLabel>
        {q.isLoading ? <Skeleton className="h-16 w-full" /> : today.length === 0 ? <p className="text-ink-2">{t('home.noneToday')}</p> : (
          <div className="overflow-hidden rounded-card border border-line bg-surface">{today.map(i => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="flex min-h-[64px] items-center justify-between gap-3 border-t border-dashed border-line p-4 first:border-t-0">
              <div className="min-w-0"><p className="num font-semibold">{i.invoiceNo}</p><p className="truncate text-xs text-ink-2">{i.supplierName}</p></div>
              <Money sen={i.totalSen} className="shrink-0 font-semibold" />
            </Link>))}</div>
        )}
      </section>
    </Page>
  );
}

export default function HomePage() {
  const { role } = useAuth();
  const isOwner = !!role && can(role, 'approve_flag');
  return isOwner ? <OwnerHome /> : <StaffHome />;
}

function OwnerHome() {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['home'], refetchOnMount: 'always', queryFn: () => api.get<Home>('/home') });
  const d = q.data;
  const allZero = !!d && d.summary.flaggedSen === 0 && d.summary.settledSen === 0 && d.summary.openSen === 0;
  return (
    <Page title={t('app.name')} action={d && <span className="num rounded-[4px] border border-line px-2 py-1 text-xs font-medium text-ink-2">{t('checks.left', { n: d.checksLeft })}</span>}>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !d ? <div className="space-y-3"><Skeleton className="h-44 w-full" /><Skeleton className="h-20 w-full" /></div> : (
        <>
          <Link href="/flags" className="block">
            <div className="rounded-card bg-ink p-5 text-brand-ink">
              <p className="text-[11px] uppercase tracking-[.12em] opacity-70">{t('home.thisMonth')} · {t('home.flagged')}</p>
              {allZero ? <p className="mt-3 text-2xl font-semibold leading-8">{t('home.none')}</p>
                : <span className="mt-1 inline-block border-b-[3px] border-double border-white/30 pb-1"><Money sen={d.summary.flaggedSen} animate className="text-[40px] font-bold leading-[44px]" rmClassName="text-brand-ink/70" /></span>}
              <div className="mt-4 grid grid-cols-2 divide-x divide-white/15 border-t border-white/15 pt-3 text-xl">
                <div className="pr-3"><p className="text-xs opacity-70">{t('home.settled')}</p><Money sen={d.summary.settledSen} animate className="font-semibold" rmClassName="text-brand-ink/70" /></div>
                <div className="pl-4"><p className="text-xs opacity-70">{t('home.open')}</p><Money sen={d.summary.openSen} animate className="font-semibold" rmClassName="text-brand-ink/70" /></div>
              </div>
            </div>
          </Link>
          {d.firstRun ? (
            <div className="mt-6"><EmptyState text={t('home.firstRunBody')}><p className="text-lg font-semibold text-ink">{t('home.firstRun')}</p><Button asChild><Link href="/scan"><ScanLine size={20} aria-hidden />{t('home.recordDeliveryShort')}</Link></Button></EmptyState></div>
          ) : d.needsActionCount === 0 && d.followUpCount === 0 && (
            <p className="mt-6 rounded-card border border-dashed border-line px-4 py-4 text-ink-2">{t('home.allClear')}</p>
          )}
          <Section title={t('home.needsAction')} count={d.needsActionCount} flags={d.needsAction} />
          <Section title={t('home.followUp')} count={d.followUpCount} flags={d.followUps} />
          {d.credits.length > 0 && (
            <section className="mt-6"><SectionLabel>{t('home.credits')}</SectionLabel>
              <div className="flex flex-wrap gap-2">{d.credits.map(c => (
                <Link key={c.id} href={`/suppliers/${c.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-card border border-line bg-surface px-3 text-sm font-medium"><span>{c.name}</span><Money sen={c.creditSen} className="text-ok" /></Link>))}</div>
            </section>
          )}
          {d.deliveries.length > 0 && (
            <section className="mt-6"><SectionLabel count={d.deliveries.length}>{t('home.deliveries')}</SectionLabel>
              <div className="overflow-hidden rounded-card border border-line bg-surface">{d.deliveries.map(x => (
                <Link key={x.id} href={x.invoiceId ? `/invoices/${x.invoiceId}/compare` : `/deliveries/${x.id}/count`} className="flex min-h-[56px] items-center justify-between gap-3 border-t border-dashed border-line px-4 py-2 first:border-t-0">
                  <div className="min-w-0"><p className="num font-medium">{x.doNo}</p><p className="truncate text-xs text-ink-2">{x.supplierName} · <span className="num">{fmtDate(x.receivedAt, lang)}</span></p></div>
                  <Badge tone={delTone[x.state]} className="shrink-0">{x.state === 'billed' ? t('flag.broughtToInvoice') : t(`deliveries.state.${x.state}` as Key)}</Badge>
                </Link>))}</div>
            </section>
          )}
          {d.recent.length > 0 && (
            <section className="mt-6"><SectionLabel>{t('home.recent')}</SectionLabel>
              <div className="overflow-hidden rounded-card border border-line bg-surface">{d.recent.map(e => {
                const k = `act.${e.action}` as Key; const lbl = t(k) === k ? e.action : t(k);
                return <div key={e.id} className="relative flex min-h-11 items-center justify-between gap-3 border-t border-dashed border-line py-2 pl-5 pr-4 first:border-t-0"><span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${e.role === 'owner' ? 'bg-ink' : 'bg-line'}`} /><span className="truncate text-sm">{lbl}</span><time className="num shrink-0 text-xs text-ink-2">{new Date(e.at).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ms-MY', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}</time></div>;
              })}<Link href="/activity" className="flex min-h-11 items-center justify-center border-t border-dashed border-line text-sm font-semibold text-brand">{t('home.more')}</Link></div>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
