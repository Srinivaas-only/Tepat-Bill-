import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const badge = cva('inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-1 text-[11px] font-medium uppercase leading-none tracking-[.06em]', {
  variants: { tone: {
    neutral: 'border-line-strong/50 text-ink-2 [.on-dark_&]:border-white/30 [.on-dark_&]:bg-white/10 [.on-dark_&]:text-white/85', brand: 'border-brand/45 bg-brand/[.06] text-brand [.on-dark_&]:border-[#93B4FF]/50 [.on-dark_&]:bg-[#93B4FF]/15 [.on-dark_&]:text-[#C4D5FF]', short: 'border-short/45 bg-short-bg/60 text-short [.on-dark_&]:border-[#FBBF77]/50 [.on-dark_&]:bg-[#FBBF77]/15 [.on-dark_&]:text-[#FCD29A]', price: 'border-price/45 bg-price-bg/60 text-price [.on-dark_&]:border-[#C4B5FD]/50 [.on-dark_&]:bg-[#C4B5FD]/15 [.on-dark_&]:text-[#D9CFFF]',
    notord: 'border-notord/45 bg-notord-bg/60 text-notord [.on-dark_&]:border-[#FDA4AF]/50 [.on-dark_&]:bg-[#FDA4AF]/15 [.on-dark_&]:text-[#FECDD3]', ok: 'border-ok/45 bg-ok-bg/60 text-ok [.on-dark_&]:border-[#6EE7B7]/50 [.on-dark_&]:bg-[#6EE7B7]/15 [.on-dark_&]:text-[#A7F3D0]', dispute: 'border-dispute/45 bg-dispute-bg/60 text-dispute [.on-dark_&]:border-[#FDBA74]/50 [.on-dark_&]:bg-[#FDBA74]/15 [.on-dark_&]:text-[#FED7AA]',
  } }, defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ className, tone, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) =>
  <span className={cn(badge({ tone }), className)} {...p} />;
