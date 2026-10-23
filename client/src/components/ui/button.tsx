import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold disabled:pointer-events-none disabled:opacity-50 rounded-btn',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-ink shadow-[0_1px_0_rgba(255,255,255,.18)_inset,0_6px_16px_-8px_rgba(36,87,214,.7)] [@media(hover:hover)]:hover:bg-brand-hover',
        secondary: 'bg-surface text-ink ring-1 ring-ink/15 [@media(hover:hover)]:hover:bg-surface-2',
        light: 'bg-white text-ink shadow-[0_8px_24px_-10px_rgba(0,0,0,.5)] [@media(hover:hover)]:hover:bg-white/90',
        glass: 'bg-white/12 text-white ring-1 ring-white/20 backdrop-blur [@media(hover:hover)]:hover:bg-white/20',
        ghost: 'bg-transparent text-ink [@media(hover:hover)]:hover:bg-surface-2',
        destructive: 'bg-notord text-white [@media(hover:hover)]:hover:bg-notord-hover',
        wa: 'bg-wa text-ink font-semibold [@media(hover:hover)]:hover:brightness-95',
      },
      size: { md: 'h-[52px] px-5 text-base', sm: 'h-11 px-4 text-sm', icon: 'h-11 w-11' },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, block, asChild, ...props }, ref) => {
  const cls = cn(buttonVariants({ variant, size, block }), className);
  if (asChild) return <Slot className={cls} ref={ref as never} {...props} />;
  return <button ref={ref} className={cls} {...props} />;
});
Button.displayName = 'Button';
