import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const badge = cva('inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[3px] text-[11px] font-medium uppercase leading-none tracking-[.06em]', {
  variants: { tone: {
    neutral: 'border-line text-ink-2', brand: 'border-brand/50 text-brand', short: 'border-short/50 text-short', price: 'border-price/50 text-price',
    notord: 'border-notord/50 text-notord', ok: 'border-ok/50 text-ok', dispute: 'border-dispute/50 text-dispute',
  } }, defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) =>
  <span className={cn(badge({ tone }), className)} {...p} />;
