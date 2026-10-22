import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { api } from '@/lib/api';
import { Page, EmptyState } from '@/components/page';
import { FlagCard, type FlagView } from '@/components/flag-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';

const groups = { review: ['proposed'], open: ['open', 'disputed'], done: ['settled', 'dismissed'] } as const;

export default function Flags() {
  const { t } = useI18n();
  const [tab, setTab] = useState<keyof typeof groups>('review');
  const q = useQuery({ queryKey: ['flags'], queryFn: () => api.get<{ flags: FlagView[] }>('/flags') });
  const all = q.data?.flags ?? [];
  const flags = all.filter(f => (groups[tab] as readonly string[]).includes(f.status));
  const n = (k: keyof typeof groups) => all.filter(f => (groups[k] as readonly string[]).includes(f.status)).length;
  return (
    <Page title={t('nav.flags')}>
      <Tabs value={tab} onValueChange={v => setTab(v as keyof typeof groups)} className="mb-4">
        <TabsList>
          <TabsTrigger value="review">{t('flags.tab.review')} {n('review') > 0 && <span className="tnum">({n('review')})</span>}</TabsTrigger>
          <TabsTrigger value="open">{t('flags.tab.open')}</TabsTrigger>
          <TabsTrigger value="done">{t('flags.tab.done')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px] w-full" />)}</div>
        : flags.length === 0 ? <EmptyState icon={<Flag size={26} strokeWidth={1.5} />} text={t('flags.empty')} />
        : <div className="space-y-3">{flags.map((f, i) => <Link key={f.id} href={`/flags/${f.id}`} className="block"><FlagCard flag={f} index={i} /></Link>)}</div>}
    </Page>
  );
}
