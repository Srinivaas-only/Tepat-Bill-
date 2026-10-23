import { Link, useLocation } from 'wouter';
import { Home, Flag, Users, Menu, ScanLine } from 'lucide-react';
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

export function BottomNav() {
  const home = useQuery({ queryKey: ['home'], refetchOnMount: 'always', queryFn: () => api.get<{ needsActionCount: number; followUpCount: number }>('/home') });
  const flagBadge = (home.data?.needsActionCount ?? 0) + (home.data?.followUpCount ?? 0);
  const [loc] = useLocation();
  const { t } = useI18n();
  const tab = (i: (typeof items)[number]) => {
    const active = i.match(loc);
    const Icon = i.icon;
    return (
      <Link key={i.to} href={i.to} className={cn('relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium', active ? 'text-ink after:absolute after:inset-x-4 after:top-0 after:h-[2px] after:bg-ink' : 'text-ink-2')} aria-current={active ? 'page' : undefined} aria-label={i.to === '/flags' && flagBadge > 0 ? `${t(i.key)} ${flagBadge}` : undefined}>
        <span className="relative">
          <Icon size={22} strokeWidth={1.5} aria-hidden />
          {i.to === '/flags' && flagBadge > 0 && (
            <span className="num absolute -right-3 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-notord px-1 text-[11px] font-semibold text-brand-ink">{flagBadge}</span>
          )}
        </span>
        {t(i.key)}
      </Link>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-surface" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="mx-auto flex h-16 max-w-[480px] items-center border-t border-line px-2">
        {tab(items[0])}{tab(items[1])}
        <div className="flex flex-1 justify-center">
          <div className="-mt-5">
            <Link href="/scan" aria-label={t('nav.scan')} className="flex flex-col items-center">
              <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand text-brand-ink"><ScanLine size={26} strokeWidth={1.75} aria-hidden /></span>
              <span className="mt-0.5 text-xs font-medium text-ink-2">{t('nav.scan')}</span>
            </Link>
          </div>
        </div>
        {tab(items[2])}{tab(items[3])}
      </div>
    </nav>
  );
}
