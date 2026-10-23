import { Link, useLocation } from 'wouter';
import { Home, Flag, Users, Menu, ScanLine } from 'lucide-react';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { Key } from '@/i18n/ms';

const items: { to: string; key: Key; icon: typeof Home; match: (p: string) => boolean }[] = [
  { to: '/', key: 'nav.home', icon: Home, match: p => p === '/' },
  { to: '/flags', key: 'nav.flags', icon: Flag, match: p => p.startsWith('/flags') },
  { to: '/suppliers', key: 'nav.suppliers', icon: Users, match: p => p.startsWith('/suppliers') },
  { to: '/more', key: 'nav.more', icon: Menu, match: p => ['/more', '/orders', '/activity', '/settings'].some(x => p.startsWith(x)) },
];

/** Floating frosted pill. Five items share one baseline; the active tint glides between tabs (shared layout spring). */
export function BottomNav() {
  const home = useQuery({ queryKey: ['home'], refetchOnMount: 'always', queryFn: () => api.get<{ needsActionCount: number; followUpCount: number }>('/home') });
  const flagBadge = (home.data?.needsActionCount ?? 0) + (home.data?.followUpCount ?? 0);
  const [loc] = useLocation();
  const { t } = useI18n();
  const tab = (i: (typeof items)[number]) => {
    const active = i.match(loc);
    const Icon = i.icon;
    return (
      <Link key={i.to} href={i.to} className={cn('press relative flex h-14 flex-1 flex-col items-center justify-center gap-1 rounded-card text-caption transition-colors', active ? 'font-semibold text-ink' : 'font-medium text-ink-2')} aria-current={active ? 'page' : undefined} aria-label={i.to === '/flags' && flagBadge > 0 ? `${t(i.key)} ${flagBadge}` : undefined}>
        {active && <motion.span layoutId="nav-active" aria-hidden className="absolute inset-x-1 inset-y-1 -z-10 rounded-btn bg-white/10 shadow-[inset_0_1px_0_rgb(255_255_255/.10),inset_0_0_0_1px_rgb(255_255_255/.06)]" transition={{ type: 'spring', stiffness: 460, damping: 36 }} />}
        <span className="relative">
          <Icon size={24} strokeWidth={1.5} aria-hidden className={active ? 'text-ink' : 'text-ink-3'} />
          {i.to === '/flags' && flagBadge > 0 && (
            <span className="num absolute -right-3 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white ring-2 ring-bg">{flagBadge}</span>
          )}
        </span>
        {t(i.key)}
      </Link>
    );
  };
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 isolate" style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}>
      <div className="mx-auto max-w-[480px] px-3">
        <div className="glass pointer-events-auto flex h-16 items-center gap-1 rounded-sheet px-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/.10),inset_0_1px_0_rgb(255_255_255/.07),0_20px_40px_-12px_rgb(0_0_0/.7)]">
          {tab(items[0])}{tab(items[1])}
          <Link href="/scan" aria-label={t('nav.scan')} className="press flex h-14 flex-1 flex-col items-center justify-center gap-1 text-caption font-semibold text-ink">
            <span className="flex h-[26px] w-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255/.22),0_6px_16px_-6px_rgb(36_87_214/.9)]"><ScanLine size={20} strokeWidth={1.5} aria-hidden /></span>
            {t('nav.scan')}
          </Link>
          {tab(items[2])}{tab(items[3])}
        </div>
      </div>
    </nav>
  );
}
