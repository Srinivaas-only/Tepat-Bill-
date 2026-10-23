import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, History, ScanLine, Users } from 'lucide-react';
import { can } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import type { Key } from '@/i18n/ms';
import { fmtDate } from '@/lib/dates';
import { HeroPage, Frost, ErrorState, SectionLabel } from '@/components/page';
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
      <FlagLedger flags={flags} dark />
      {count > flags.length && <Link href="/flags" className="press mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-white/90">{t('home.more')}<ChevronRight size={16} aria-hidden /></Link>}
    </section>
  );
}

/** Revolut-style quick actions: four circles that jump to existing screens (no new features). */
function QuickActions() {
  const { t } = useI18n();
  const items = [
    { to: '/scan', icon: ScanLine, label: t('nav.scan') },
    { to: '/orders', icon: ClipboardList, label: t('home.qa.orders') },
    { to: '/activity', icon: History, label: t('more.activity') },
    { to: '/suppliers', icon: Users, label: t('nav.suppliers') },
  ];
  return (
    <nav aria-label={t('home.qa.orders')} className="mt-7 grid grid-cols-4 gap-2">
      {items.map(i => (
        <Link key={i.to} href={i.to} className="press group flex flex-col items-center gap-2 text-xs font-medium text-white/90">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/12 text-white ring-1 ring-white/20 backdrop-blur [@media(hover:hover)]:group-hover:bg-white/20"><i.icon size={22} strokeWidth={1.75} aria-hidden /></span>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

interface InvToday { id: string; invoiceNo: string; supplierName: string; totalSen: number; issuedAt: number }

function StaffHome() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['invoices', 'today'], refetchOnMount: 'always', queryFn: () => api.get<{ invoices: InvToday[] }>('/invoices') });
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = (q.data?.invoices ?? []).filter(i => i.issuedAt >= start.getTime());
  return (
    <HeroPage>
      <h1 className="text-xl font-semibold tracking-tight">{t('app.name')}</h1>
      <div className="mt-10 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[.14em] text-white/70">{t('home.todayInvoices')}</p>
        <p className="num mt-2 text-[56px] font-bold leading-[60px] tracking-tight">{q.isLoading ? '–' : today.length}</p>
      </div>
      <Button block asChild variant="light" className="mt-8 h-16 text-lg"><Link href="/scan"><ScanLine size={24} aria-hidden />{t('home.recordDelivery')}</Link></Button>
      <section className="mt-8">
        <SectionLabel>{t('home.todayInvoices')}</SectionLabel>
        {q.isLoading ? <Skeleton className="h-16 w-full" /> : today.length === 0 ? <p className="text-white/70">{t('home.noneToday')}</p> : (
          <Frost>{today.map(i => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="press flex min-h-[64px] items-center justify-between gap-3 border-t border-dashed border-white/15 p-4 first:border-t-0">
              <div className="min-w-0"><p className="num font-semibold">{i.invoiceNo}</p><p className="truncate text-xs text-white/70">{i.supplierName}</p></div>
              <Money sen={i.totalSen} className="shrink-0 font-semibold" />
            </Link>))}</Frost>
        )}
      </section>
    </HeroPage>
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
    <HeroPage>
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{t('app.name')}</h1>
        {d && <span className="num rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85 ring-1 ring-white/15 backdrop-blur">{t('checks.left', { n: d.checksLeft })}</span>}
      </header>
      {q.isError ? <div className="mt-8 text-ink"><ErrorState onRetry={() => void q.refetch()} /></div> : !d ? (
        <div className="mt-10 space-y-4"><Skeleton className="mx-auto h-24 w-3/4" /><Skeleton className="h-14 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <>
          <Link href="/flags" className="press mt-10 block text-center" aria-label={`${t('home.flagged')}: ${t('compare.viewFlags')}`}>
            <p className="text-[11px] font-medium uppercase tracking-[.14em] text-white/70">{t('home.thisMonth')} · {t('home.flagged')}</p>
            {allZero ? <p className="mt-3 text-2xl font-semibold leading-8">{t('home.none')}</p>
              : <Money sen={d.summary.flaggedSen} animate className="mt-2 block text-[56px] font-bold leading-[60px] tracking-tight" />}
            <span className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-full bg-white/12 px-4 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur">{t('compare.viewFlags')}<ChevronRight size={16} aria-hidden /></span>
          </Link>
          <div className="mx-auto mt-6 grid max-w-[340px] grid-cols-2 divide-x divide-white/15 text-center">
            <div className="px-3"><p className="text-xs text-white/70">{t('home.settled')}</p><Money sen={d.summary.settledSen} animate className="text-xl font-semibold" /></div>
            <div className="px-3"><p className="text-xs text-white/70">{t('home.open')}</p><Money sen={d.summary.openSen} animate className="text-xl font-semibold" /></div>
          </div>
          <QuickActions />
          {d.firstRun ? (
            <Frost className="mt-7 p-5 text-center"><p className="text-lg font-semibold">{t('home.firstRun')}</p><p className="mt-1 text-sm text-white/70">{t('home.firstRunBody')}</p>
              <Button asChild variant="light" className="mt-4"><Link href="/scan"><ScanLine size={20} aria-hidden />{t('home.recordDeliveryShort')}</Link></Button></Frost>
          ) : d.needsActionCount === 0 && d.followUpCount === 0 && (
            <Frost className="mt-7 px-4 py-4 text-white/80">{t('home.allClear')}</Frost>
          )}
          <Section title={t('home.needsAction')} count={d.needsActionCount} flags={d.needsAction} />
          <Section title={t('home.followUp')} count={d.followUpCount} flags={d.followUps} />
          {d.credits.length > 0 && (
            <section className="mt-6"><SectionLabel>{t('home.credits')}</SectionLabel>
              <div className="flex flex-wrap gap-2">{d.credits.map(c => (
                <Link key={c.id} href={`/suppliers/${c.id}`} className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium ring-1 ring-white/15 backdrop-blur"><span>{c.name}</span><Money sen={c.creditSen} className="text-[#A7F3D0]" /></Link>))}</div>
            </section>
          )}
          {d.deliveries.length > 0 && (
            <section className="mt-6"><SectionLabel count={d.deliveries.length}>{t('home.deliveries')}</SectionLabel>
              <Frost>{d.deliveries.map(x => (
                <Link key={x.id} href={x.invoiceId ? `/invoices/${x.invoiceId}/compare` : `/deliveries/${x.id}/count`} className="press flex min-h-[60px] items-center justify-between gap-3 border-t border-dashed border-white/15 px-4 py-2 first:border-t-0">
                  <div className="min-w-0"><p className="num font-medium">{x.doNo}</p><p className="flex items-center gap-1 text-xs text-white/70"><span className="truncate">{x.supplierName}</span><span aria-hidden>·</span><span className="num shrink-0">{fmtDate(x.receivedAt, lang)}</span></p></div>
                  <Badge tone={delTone[x.state]} className="shrink-0">{x.state === 'billed' ? t('flag.broughtToInvoice') : t(`deliveries.state.${x.state}` as Key)}</Badge>
                </Link>))}</Frost>
            </section>
          )}
          {d.recent.length > 0 && (
            <section className="mt-6"><SectionLabel>{t('home.recent')}</SectionLabel>
              <Frost>{d.recent.map(e => {
                const k = `act.${e.action}` as Key; const lbl = t(k) === k ? t('act.unknown') : t(k);
                return <div key={e.id} className="relative flex min-h-11 items-center justify-between gap-3 border-t border-dashed border-white/15 py-2 pl-5 pr-4 first:border-t-0"><span aria-hidden className={`absolute inset-y-2 left-2 w-[3px] rounded-full ${e.role === 'owner' ? 'bg-white' : 'bg-white/30'}`} /><span className="truncate text-sm">{lbl}</span><time className="num shrink-0 text-xs text-white/70">{new Date(e.at).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'ms-MY', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}</time></div>;
              })}<Link href="/activity" className="press flex min-h-11 items-center justify-center border-t border-dashed border-white/15 text-sm font-semibold text-white/90">{t('home.more')}</Link></Frost>
            </section>
          )}
        </>
      )}
    </HeroPage>
  );
}
