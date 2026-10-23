import type { ReactNode } from 'react';
import { motion } from 'motion/react';

export function Page({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="px-5 pb-8 pt-[calc(24px+var(--safe-top))]">
      {title && (
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-[28px] font-semibold leading-[34px]">{title}</h1>
          {action}
        </header>
      )}
      {children}
    </motion.main>
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
