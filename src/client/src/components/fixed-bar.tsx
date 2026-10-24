import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The one sticky bottom bar: capped to the app column (never full-bleed on tablet/desktop), frosted dark, safe-area aware. */
export function FixedBar({ children, className, ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40" {...p}>
      <div className={cn('glass pointer-events-auto mx-auto max-w-[480px] border-t border-line px-5 pt-3 pb-[calc(12px+var(--safe-bottom))]', className)}>{children}</div>
    </div>
  );
}
