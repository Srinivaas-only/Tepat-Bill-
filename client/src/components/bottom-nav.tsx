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
      <Link key={i.to} href={i.to} className={cn('press relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px] text-xs transition-colors', active ? 'font-semibold text-ink' : 'font-medium text-ink-2')} aria-current={active ? 'page' : undefined} aria-label={i.to === '/flags' && flagBadge > 0 ? `${t(i.key)} ${flagBadge}` : undefined}>
        {active && <motion.span layoutId="nav-active" aria-hidden className="absolute inset-x-1.5 inset-y-0.5 -z-10 rounded-[20px] bg-brand/[.14]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
        <span className="relative">
          <Icon size={22} strokeWidth={active ? 2 : 1.5} aria-hidden className="my-[2px]" />
          {i.to === '/flags' && flagBadge > 0 && (
            <span className="num absolute -right-3 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-notord px-1 text-[11px] font-semibold text-brand-ink ring-2 ring-[color:var(--surface)]">{flagBadge}</span>
          )}
        </span>
        {t(i.key)}
      </Link>
    );
  };
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 isolate" style={{ paddingBottom: 'calc(10px + var(--safe-bottom))' }}>
      <div className="mx-auto max-w-[480px] px-3">
        <div className="glass pointer-events-auto flex h-16 items-center gap-0.5 rounded-[28px] px-1.5 shadow-[0_0_0_1px_rgba(19,37,74,.08),0_18px_40px_-14px_rgba(19,37,74,.35)]">
          {tab(items[0])}{tab(items[1])}
          <Link href="/scan" aria-label={t('nav.scan')} className="press flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-ink">
            <span className="flex h-[26px] w-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-[0_1px_0_rgba(255,255,255,.2)_inset,0_6px_14px_-6px_rgba(36,87,214,.8)]"><ScanLine size={18} strokeWidth={2} aria-hidden /></span>
            {t('nav.scan')}
          </Link>
          {tab(items[2])}{tab(items[3])}
        </div>
      </div>
    </nav>
  );
}
