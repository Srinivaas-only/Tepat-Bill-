import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';

export function Page({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <main className="px-5 pb-8 pt-[calc(24px+var(--safe-top))]">
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

export function EmptyState({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line bg-surface px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-brand">{icon}</div>
      <p className="text-ink-2">{text}</p>
      {children}
    </div>
  );
}

export function ErrorState({ onRetry, notFound }: { onRetry: () => void; notFound?: boolean }) {
  const { t } = useI18n();
  return (
    <EmptyState icon={<AlertTriangle size={26} strokeWidth={1.5} />} text={t(notFound ? 'flag.notFound' : 'common.error')}>
      <Button size="sm" variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>
    </EmptyState>
  );
}
