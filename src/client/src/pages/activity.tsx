import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { Page, EmptyState, ErrorState } from '@/components/page';
import { Skeleton } from '@/components/ui/skeleton';

interface Ev { id: number; at: number; role: string; action: string; ref: string | null; meta?: Record<string, unknown> | null }

/** One-line detail from the event meta: who changed what, from/to, why, accepted amount and reference. */
function detailOf(e: Ev, t: (k: Key, v?: Record<string, string | number>) => string): string | null {
  const m = e.meta; if (!m) return null;
  const bits: string[] = [];
  const changes = Array.isArray(m.changes) ? (m.changes as { key: string; from: number | null; to: number }[]) : [];
  if (changes.length) bits.push(changes.slice(0, 3).map(c => `${c.key.replace(/^line:/, '')}: ${c.from ?? '–'} → ${c.to}`).join(', ') + (changes.length > 3 ? ` +${changes.length - 3}` : ''));
  if (typeof m.reason === 'string' && m.reason) bits.push(`${t('act.reason')}: ${m.reason}`);
  if (typeof m.acceptedSen === 'number') bits.push(`${t('act.accepted')} RM${(m.acceptedSen / 100).toFixed(2)}`);
  if (typeof m.ref === 'string' && m.ref) bits.push(m.ref);
  if (typeof m.recheck === 'number' && m.recheck > 0) bits.push(t('act.recheck', { n: m.recheck }));
  return bits.length ? bits.join(' · ') : null;
}

export default function Activity() {
  const { t, lang } = useI18n();
  const loc = lang === 'ms' ? 'ms-MY' : 'en-GB';
  const q = useQuery({ queryKey: ['activity'], refetchOnMount: 'always', queryFn: () => api.get<{ events: Ev[] }>('/activity') });
  const events = q.data?.events ?? [];
  const label = (a: string) => { const k = `act.${a}` as Key; const s = t(k); return s === k ? t('act.unknown') : s; };
  const groups = [...events.reduce((m, e) => { const k = new Date(e.at).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }); m.set(k, [...(m.get(k) ?? []), e]); return m; }, new Map<string, Ev[]>())];
  return (
    <Page band title={t('activity.title')}>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : q.isLoading ? <div className="space-y-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
        : events.length === 0 ? <EmptyState text={t('activity.empty')} />
        : <div className="stagger space-y-4">{groups.map(([day, evs]) => (
          <section key={day}>
            <h2 className="sticky top-0 z-10 bg-bg py-2 eyebrow">{day}</h2>
            <div className="overflow-hidden rounded-card bg-surface shadow-card">{evs.map(e => {
              const body = (
                <div className="relative flex min-h-14 items-center gap-3 border-t border-line px-4 py-2 pl-5">
                  <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${e.role === 'owner' ? 'bg-brand-text' : 'bg-white/25'}`} />
                  <div className="min-w-0 flex-1"><p className="font-medium">{label(e.action)}</p><p className="text-xs text-ink-2">{t(e.role === 'owner' ? 'role.owner' : 'role.staff')}</p>{detailOf(e, t) && <p className="num break-words text-xs text-ink-2">{detailOf(e, t)}</p>}</div>
                  <time className="num shrink-0 text-xs text-ink-2">{new Date(e.at).toLocaleTimeString(loc, { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })}</time>
                </div>);
              return e.action.startsWith('flag.') && e.ref ? <Link key={e.id} href={`/flags/${e.ref}`} className="block">{body}</Link> : <div key={e.id}>{body}</div>;
            })}</div>
          </section>))}</div>}
    </Page>
  );
}
