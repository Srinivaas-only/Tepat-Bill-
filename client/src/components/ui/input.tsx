import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) =>
  <input ref={ref} className={cn('h-12 w-full rounded-btn border border-line bg-surface px-4 text-base text-ink placeholder:text-ink-2/70 focus-visible:border-brand aria-[invalid=true]:border-notord aria-[invalid=true]:bg-notord-bg/40', className)} {...p} />);
Input.displayName = 'Input';
