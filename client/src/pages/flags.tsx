import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Flag, ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { Page, EmptyState, ErrorState } from '@/components/page';
import { FlagLedger, type FlagView } from '@/components/flag-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';

const groups = { review: ['proposed'], open: ['open'], disputed: ['disputed'], done: ['settled', 'dismissed'] } as const;
type Tab = keyof typeof groups;

export default function Flags() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('review');
  const q = useQuery({ queryKey: ['flags'], queryFn: () => api.get<{ flags: FlagView[] }>('/flags') });
  const all = q.data?.flags ?? [];
  // superseded delivery flags (brought to the invoice) live under Selesai, never in the open tabs
  const inTab = (k: Tab) => (f: FlagView) => k === 'done' ? (groups.done as readonly string[]).includes(f.status) || !!f.supersededBy : !f.supersededBy && (groups[k] as readonly string[]).includes(f.status);
  const flags = all.filter(inTab(tab));
  const n = (k: Tab) => all.filter(inTab(k)).length;
  const label = (k: Tab) => ({ review: t('flags.tab.review'), open: t('flags.tab.open'), disputed: t('status.disputed'), done: t('flags.tab.done') })[k];
  return (
    <Page title={t('nav.flags')}>
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="mb-4">
        <TabsList>
          {(Object.keys(groups) as Tab[]).map(k => <TabsTrigger key={k} value={k} aria-label={`${label(k)} ${n(k)}`} className="min-h-14 whitespace-nowrap flex-col gap-0 px-1 py-1.5 text-[11px] leading-[13px]"><span className="num text-base font-semibold leading-5">{n(k)}</span><span>{label(k)}</span></TabsTrigger>)}
        </TabsList>
      </Tabs>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px] w-full" />)}</div>
        : flags.length === 0 ? <EmptyState icon={<Flag size={26} strokeWidth={1.5} />} text={t('flags.empty')}><Button asChild size="sm"><Link href="/scan"><ScanLine size={18} aria-hidden />{t('nav.scan')}</Link></Button></EmptyState>
        : <FlagLedger flags={flags} />}
    </Page>
  );
}
