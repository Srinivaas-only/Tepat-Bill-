import NumberFlow from '@number-flow/react';
import { formatRM } from '@shared/core';
import { cn } from '@/lib/utils';

/** RM at 60% size and lighter than the digits. Animated variant rolls digits (display only: the one permitted float). */
export function Money({ sen, animate, className, rmClassName }: { sen: number; animate?: boolean; className?: string; rmClassName?: string }) {
  const rm = <span className={cn('mr-[0.12em] text-[0.6em] font-medium text-ink-2', rmClassName)}>RM</span>;
  if (animate) {
    return (
      <span className={cn('tnum inline-flex items-baseline', className)}>
        {sen < 0 ? '-' : ''}{rm}
        <NumberFlow value={Math.abs(sen) / 100} locales="en-US" format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
      </span>
    );
  }
  const s = formatRM(Math.abs(sen)).replace('RM', '');
  return <span className={cn('tnum', className)}>{sen < 0 ? '-' : ''}{rm}{s}</span>;
}
