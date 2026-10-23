import { Link, useLocation } from 'wouter';
import { Home, Flag, Users, Menu, ScanLine } from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { Key } from '@/i18n/ms';

const items: { to: string; key: Key; icon: typeof Home; match: (p: string) => boolean }[] = [
  { to: '/', key: 'nav.home', icon: Home, match: p => p === '/' },
  { to: '/flags', key: 'nav.flags', icon: Flag, match: p => p.startsWith('/flags') },
  { to: '/suppliers', key: 'nav.suppliers', icon: Users, match: p => p.startsWith('/suppliers') },
  { to: '/more', key: 'nav.more', icon: Menu, match: p => ['/more', '/orders', '/activity', '/settings'].some(x => p.startsWith(x)) },
];

export function BottomNav({ flagBadge = 0 }: { flagBadge?: number }) {
  const [loc] = useLocation();
  const { t } = useI18n();
  const tab = (i: (typeof items)[number]) => {
    const active = i.match(loc);
    const Icon = i.icon;
    return (
      <Link key={i.to} href={i.to} className={cn('relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium', active ? 'text-brand' : 'text-ink-2')} aria-current={active ? 'page' : undefined}>
        <span className="relative">
          <Icon size={22} strokeWidth={1.5} aria-hidden />
          {i.to === '/flags' && flagBadge > 0 && (
            <span className="tnum absolute -right-3 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-notord px-1 text-[11px] font-semibold text-white">{flagBadge}</span>
          )}
        </span>
        {t(i.key)}
      </Link>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/85 backdrop-blur-xl" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="mx-auto flex h-16 max-w-[480px] items-center px-2">
        {tab(items[0])}{tab(items[1])}
        <div className="flex flex-1 justify-center">
          <motion.div whileTap={{ scale: 0.94 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="-mt-4">
            <Link href="/scan" aria-label={t('nav.scan')} className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand text-brand-ink shadow-elev">
              <ScanLine size={26} strokeWidth={1.75} aria-hidden />
            </Link>
          </motion.div>
        </div>
        {tab(items[2])}{tab(items[3])}
      </div>
    </nav>
  );
}
