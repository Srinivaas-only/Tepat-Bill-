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

export function Page({ title, children, action, back }: { title?: string; children: ReactNode; action?: ReactNode; back?: string }) {
  return (
    <main className="px-5 pb-8 pt-[calc(16px+var(--safe-top))]">
      {back && <BackButton fallback={back} />}
      {title && (
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-[28px] font-semibold leading-[34px]">{title}</h1>
          {action}
        </header>
      )}
      {children}
    </main>
  );
}

/** Section heading: small caps, optional count, dashed rule. */
export function SectionLabel({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.12em] text-ink-2">
      {children}{count !== undefined && <span className="num">{count}</span>}<span aria-hidden className="h-px flex-1 border-t border-dashed border-line" />
    </h2>
  );
}

export function EmptyState({ text, children }: { icon?: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center">
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
