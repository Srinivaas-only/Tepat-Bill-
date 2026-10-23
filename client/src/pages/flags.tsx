import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Flag, ScanLine } from 'lucide-react';
import { api } from '@/lib/api';
import { Page, EmptyState } from '@/components/page';
import { FlagCard, type FlagView } from '@/components/flag-card';
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
  const flags = all.filter(f => (groups[tab] as readonly string[]).includes(f.status));
  const n = (k: Tab) => all.filter(f => (groups[k] as readonly string[]).includes(f.status)).length;
  const label = (k: Tab) => ({ review: t('flags.tab.review'), open: t('flags.tab.open'), disputed: t('status.disputed'), done: t('flags.tab.done') })[k];
  return (
    <Page title={t('nav.flags')}>
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="mb-4">
        <TabsList>
          {(Object.keys(groups) as Tab[]).map(k => <TabsTrigger key={k} value={k} className="px-2 text-xs">{label(k)} <span className="tnum">({n(k)})</span></TabsTrigger>)}
        </TabsList>
      </Tabs>
      {q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px] w-full" />)}</div>
        : flags.length === 0 ? <EmptyState icon={<Flag size={26} strokeWidth={1.5} />} text={t('flags.empty')}><Button asChild size="sm"><Link href="/scan"><ScanLine size={18} aria-hidden />{t('nav.scan')}</Link></Button></EmptyState>
        : <div className="space-y-3">{flags.map((f, i) => <Link key={f.id} href={`/flags/${f.id}`} className="block"><FlagCard flag={f} index={i} /></Link>)}</div>}
    </Page>
  );
}
