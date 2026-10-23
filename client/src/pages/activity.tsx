import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { Page, EmptyState } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Ev { id: number; at: number; role: string; action: string; ref: string | null }

export default function Activity() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['activity'], refetchOnMount: 'always', queryFn: () => api.get<{ events: Ev[] }>('/activity') });
  const events = q.data?.events ?? [];
  const label = (a: string) => { const k = `act.${a}` as Key; const s = t(k); return s === k ? a : s; };
  const groups = [...events.reduce((m, e) => { const k = new Date(e.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); m.set(k, [...(m.get(k) ?? []), e]); return m; }, new Map<string, Ev[]>())];
  return (
    <Page title={t('activity.title')}>
      {q.isLoading ? <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
        : events.length === 0 ? <EmptyState icon={<History size={26} strokeWidth={1.5} />} text={t('activity.empty')} />
        : <div className="space-y-4">{groups.map(([day, evs]) => (
          <section key={day}>
            <h2 className="sticky top-0 z-10 bg-bg py-2 text-sm font-semibold text-ink-2">{day}</h2>
            <Card className="divide-y divide-line">{evs.map(e => {
              const body = (
                <div className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-ink-2" aria-hidden>{e.role === 'owner' ? 'P' : 'K'}</span>
                  <div className="min-w-0 flex-1"><p className="font-medium">{label(e.action)}</p><p className="text-xs text-ink-2">{t(e.role === 'owner' ? 'role.owner' : 'role.staff')}</p></div>
                  <time className="tnum shrink-0 text-xs text-ink-2">{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</time>
                </div>);
              return e.action.startsWith('flag.') && e.ref ? <Link key={e.id} href={`/flags/${e.ref}`} className="block">{body}</Link> : <div key={e.id}>{body}</div>;
            })}</Card>
          </section>))}</div>}
    </Page>
  );
}
