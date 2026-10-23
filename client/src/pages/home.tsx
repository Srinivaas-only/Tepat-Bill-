import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ScanLine } from 'lucide-react';
import { can } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Page, ErrorState } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { FlagLedger, type FlagView } from '@/components/flag-card';

interface Home {
  summary: { flaggedSen: number; settledSen: number; openSen: number };
  needsActionCount: number; needsAction: FlagView[]; followUpCount: number; followUps: FlagView[];
}

function Section({ title, count, flags }: { title: string; count: number; flags: FlagView[] }) {
  const { t } = useI18n();
  if (flags.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between"><h2 className="text-lg font-semibold">{title} <span className="num text-ink-2">({count})</span></h2>
        {count > flags.length && <Link href="/flags" className="text-sm font-semibold text-brand">{t('home.more')}</Link>}</div>
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
        <h2 className="mb-2 text-lg font-semibold">{t('home.todayInvoices')}</h2>
        {q.isLoading ? <Skeleton className="h-16 w-full" /> : today.length === 0 ? <p className="text-ink-2">{t('home.noneToday')}</p> : (
          <div className="space-y-3">{today.map(i => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="block"><Card className="flex min-h-[64px] items-center justify-between gap-3 p-4">
              <div className="min-w-0"><p className="num font-semibold">{i.invoiceNo}</p><p className="truncate text-xs text-ink-2">{i.supplierName}</p></div>
              <Money sen={i.totalSen} className="shrink-0 font-semibold" />
            </Card></Link>))}</div>
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
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['home'], refetchOnMount: 'always', queryFn: () => api.get<Home>('/home') });
  const d = q.data;
  const allZero = !!d && d.summary.flaggedSen === 0 && d.summary.settledSen === 0 && d.summary.openSen === 0;
  const checks = useQuery({ queryKey: ['checks'], refetchOnMount: 'always', queryFn: () => api.get<{ checksLeft: number }>('/checks') });
  return (
    <Page title={t('app.name')} action={checks.data && <span className="num rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2">{t('checks.left', { n: checks.data.checksLeft })}</span>}>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !d ? <div className="space-y-3"><Skeleton className="h-44 w-full" /><Skeleton className="h-20 w-full" /></div> : (
        <>
          <Link href="/flags" className="block">
            <div className="rounded-[14px] bg-ink p-5 text-brand-ink">
              <p className="text-[11px] uppercase tracking-[.12em] opacity-70">{t('home.thisMonth')} · {t('home.flagged')}</p>
              {allZero ? <p className="mt-3 text-2xl font-semibold leading-8">{t('home.none')}</p>
                : <Money sen={d.summary.flaggedSen} animate className="mt-1 text-[40px] font-bold leading-[44px]" rmClassName="text-brand-ink/70" />}
              <div className="mt-4 grid grid-cols-2 divide-x divide-white/15 border-t border-white/15 pt-3 text-xl">
                <div className="pr-3"><p className="text-xs opacity-70">{t('home.settled')}</p><Money sen={d.summary.settledSen} animate className="font-semibold" rmClassName="text-brand-ink/70" /></div>
                <div className="pl-4"><p className="text-xs opacity-70">{t('home.open')}</p><Money sen={d.summary.openSen} animate className="font-semibold" rmClassName="text-brand-ink/70" /></div>
              </div>
            </div>
          </Link>
          {d.needsActionCount === 0 && d.followUpCount === 0 && (
            <p className="mt-6 flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-4 text-ink-2"><CheckCircle2 size={20} className="text-ok" aria-hidden />{t('home.allClear')}</p>
          )}
          <Section title={t('home.needsAction')} count={d.needsActionCount} flags={d.needsAction} />
          <Section title={t('home.followUp')} count={d.followUpCount} flags={d.followUps} />
        </>
      )}
    </Page>
  );
}
