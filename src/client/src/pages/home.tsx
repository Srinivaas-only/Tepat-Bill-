import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Page } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { FlagCard, type FlagView } from '@/components/flag-card';

interface Home {
  summary: { flaggedSen: number; settledSen: number; openSen: number };
  needsActionCount: number; needsAction: FlagView[]; followUpCount: number; followUps: FlagView[];
}

function Section({ title, count, flags }: { title: string; count: number; flags: FlagView[] }) {
  const { t } = useI18n();
  if (flags.length === 0) return null;
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between"><h2 className="text-lg font-semibold">{title} <span className="tnum text-ink-2">({count})</span></h2>
        {count > flags.length && <Link href="/flags" className="text-sm font-semibold text-brand">{t('home.more')}</Link>}</div>
      <div className="space-y-3">{flags.map((f, i) => <Link key={f.id} href={`/flags/${f.id}`} className="block"><FlagCard flag={f} index={i} /></Link>)}</div>
    </section>
  );
}

export default function HomePage() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['home'], refetchOnMount: 'always', queryFn: () => api.get<Home>('/home') });
  const d = q.data;
  const checks = useQuery({ queryKey: ['checks'], refetchOnMount: 'always', queryFn: () => api.get<{ checksLeft: number }>('/checks') });
  return (
    <Page title={t('app.name')} action={checks.data && <span className="tnum rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2">{t('checks.left', { n: checks.data.checksLeft })}</span>}>
      {!d ? <div className="space-y-3"><Skeleton className="h-44 w-full" /><Skeleton className="h-20 w-full" /></div> : (
        <>
          <Card className="bg-brand p-5 text-brand-ink">
            <p className="text-sm opacity-80">{t('home.thisMonth')} · {t('home.flagged')}</p>
            <Money sen={d.summary.flaggedSen} animate className="text-[48px] font-semibold leading-[56px]" rmClassName="text-brand-ink/80" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/15 px-3 py-2"><p className="text-xs opacity-80">{t('home.settled')}</p><Money sen={d.summary.settledSen} className="text-lg font-semibold" rmClassName="text-brand-ink/80" /></div>
              <div className="rounded-2xl bg-white/15 px-3 py-2"><p className="text-xs opacity-80">{t('home.open')}</p><Money sen={d.summary.openSen} className="text-lg font-semibold" rmClassName="text-brand-ink/80" /></div>
            </div>
          </Card>
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
