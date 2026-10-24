import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
/** Tinted chip: coloured text on a 14% tint with a 30% border. Always carries a text label (short and dispute are close in hue). */
const badge = cva('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-chip border px-2 text-[11px] font-medium uppercase leading-none tracking-[.06em]', {
  variants: { tone: {
    neutral: 'border-line-strong bg-surface-2 text-ink-2',
    brand: 'border-brand-text/30 bg-brand-text/[.14] text-brand-text',
    short: 'border-short/30 bg-short-bg text-short',
    price: 'border-price/30 bg-price-bg text-price',
    notord: 'border-notord/30 bg-notord-bg text-notord',
    ok: 'border-ok/30 bg-ok-bg text-ok',
    dispute: 'border-dispute/30 bg-dispute-bg text-dispute',
  } }, defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) =>
  <span className={cn(badge({ tone }), className)} {...p} />;
