import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const badge = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-4', {
  variants: { tone: {
    neutral: 'bg-surface-2 text-ink-2', brand: 'bg-surface-2 text-brand', short: 'bg-short-bg text-short', price: 'bg-price-bg text-price',
    notord: 'bg-notord-bg text-notord', ok: 'bg-ok-bg text-ok', dispute: 'bg-dispute-bg text-dispute',
  } }, defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) =>
  <span className={cn(badge({ tone }), className)} {...p} />;
