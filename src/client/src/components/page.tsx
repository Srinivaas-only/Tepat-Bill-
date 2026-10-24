import type { ReactNode } from 'react';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { LangSwitch } from '@/components/lang-switch';

/** history.back() when there is somewhere to go back to, else the given route. */
export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const { t } = useI18n();
  const [, nav] = useLocation();
  return (
    <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : nav(fallback))}
      className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-btn px-2 text-sm font-medium text-ink-2">
      <ChevronLeft size={18} aria-hidden />{t('common.back')}
    </button>
  );
}

export function Page({ title, children, action, back, band }: { title?: string; children: ReactNode; action?: ReactNode; back?: string; band?: boolean }) {
  if (band && title) {
    return (
      <main className="pb-8">
        <header className="flex min-h-[72px] items-end justify-between px-5 pb-4 pt-[calc(24px+var(--safe-top))]">
          <h1 className="page-title">{title}</h1>
          <div className="flex items-center gap-2">{action}<LangSwitch /></div>
        </header>
        <div className="stagger px-5">{children}</div>
      </main>
    );
  }
  return (
    <main className="px-5 pb-8 pt-[calc(16px+var(--safe-top))]">
      {back && <BackButton fallback={back} />}
      {title && (
        <header className="mb-5 flex items-center justify-between">
          <h1 className="page-title">{title}</h1>
          <div className="flex items-center gap-2">{action}<LangSwitch /></div>
        </header>
      )}
      {children}
    </main>
  );
}

/** Immersive screen (Home): blue-to-obsidian gradient behind the first 560px, ambient glow below; runs under the floating nav. */
export function HeroPage({ children }: { children: ReactNode }) {
  return (
    <main className="relative -mb-28 min-h-dvh px-5 pb-36 pt-[calc(16px+var(--safe-top))] text-ink" style={{ background: 'var(--grad-hero) top / 100% 560px no-repeat' }}>
      {children}
    </main>
  );
}

/** Frosted group used on HeroPage: translucent card, hairline rows. */
export function Frost({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`frosted overflow-hidden ${className}`}>{children}</div>;
}

/** Section heading: eyebrow, optional count, hairline rule. */
export function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="eyebrow mb-2 flex items-center gap-2">
      {children}{count !== undefined && <span className="num">{count}</span>}<span aria-hidden className="h-px flex-1 bg-line" />
    </h2>
  );
}

export function EmptyState({ icon, text, children }: { icon?: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center shadow-card">
      {icon && <span className="flex h-12 w-12 items-center justify-center rounded-card bg-brand-text/10 text-brand-text ring-1 ring-brand-text/20" aria-hidden>{icon}</span>}
      <p className="text-ink-2">{text}</p>
      {children}
    </div>
  );
}

export function ErrorState({ onRetry, notFound }: { onRetry: () => void; notFound?: boolean }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-10 text-center">
      <AlertTriangle size={22} strokeWidth={1.5} className="text-ink-2" aria-hidden />
      <p className="text-ink-2">{t(notFound ? 'flag.notFound' : 'common.error')}</p>
      <Button size="sm" variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>
    </div>
  );
}
