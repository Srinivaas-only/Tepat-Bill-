import type { ReactNode } from 'react';
import { AlertTriangle, ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';

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
        <header className="on-dark flex items-center justify-between rounded-b-[28px] px-5 pb-7 pt-[calc(16px+var(--safe-top))] text-white" style={{ background: 'var(--grad-band)' }}>
          <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight">{title}</h1>
          {action}
        </header>
        <div className="px-5 pt-5">{children}</div>
      </main>
    );
  }
  return (
    <main className="px-5 pb-8 pt-[calc(16px+var(--safe-top))]">
      {back && <BackButton fallback={back} />}
      {title && (
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-[28px] font-semibold leading-[34px] tracking-tight">{title}</h1>
          {action}
        </header>
      )}
      {children}
    </main>
  );
}

/** Immersive dark screen (Home): blue-to-ink gradient behind the first 640px, deep ink below; runs under the floating nav. */
export function HeroPage({ children }: { children: ReactNode }) {
  return (
    <main className="on-dark relative -mb-28 min-h-dvh px-5 pb-36 pt-[calc(16px+var(--safe-top))] text-white" style={{ background: 'var(--grad-hero) top / 100% 640px no-repeat, #0B1530' }}>
      {children}
    </main>
  );
}

/** Frosted group used on HeroPage: translucent card, dashed hairline rows. */
export function Frost({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`frosted overflow-hidden ${className}`}>{children}</div>;
}

/** Section heading: small caps, optional count, dashed rule. */
export function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.12em] text-ink-2 [.on-dark_&]:text-white/70">
      {children}{count !== undefined && <span className="num">{count}</span>}<span aria-hidden className="h-px flex-1 border-t border-dashed border-line [.on-dark_&]:border-white/15" />
    </h2>
  );
}

export function EmptyState({ icon, text, children }: { icon?: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card bg-surface px-6 py-10 text-center shadow-card">
      {icon && <span className="flex h-12 w-12 items-center justify-center rounded-card bg-brand/10 text-brand" aria-hidden>{icon}</span>}
      <p className="text-ink-2">{text}</p>
      {children}
    </div>
  );
}

export function ErrorState({ onRetry, notFound }: { onRetry: () => void; notFound?: boolean }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center">
      <AlertTriangle size={22} strokeWidth={1.5} className="text-ink-2" aria-hidden />
      <p className="text-ink-2">{t(notFound ? 'flag.notFound' : 'common.error')}</p>
      <Button size="sm" variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>
    </div>
  );
}
