import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) =>
  <input ref={ref} className={cn('h-12 w-full rounded-btn border border-line-strong bg-white/5 px-4 text-base text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-3 focus-visible:border-brand-text focus-visible:bg-white/[.07] aria-[invalid=true]:border-notord aria-[invalid=true]:bg-notord-bg', className)} {...p} />);
Input.displayName = 'Input';
