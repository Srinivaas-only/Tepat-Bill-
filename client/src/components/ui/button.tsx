import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 rounded-btn active:opacity-80',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-ink hover:bg-brand-hover',
        secondary: 'bg-surface-2 text-ink hover:bg-surface-2-hover',
        ghost: 'bg-transparent text-ink hover:bg-surface-2',
        destructive: 'bg-notord text-white hover:bg-notord-hover',
        wa: 'bg-wa text-ink font-semibold hover:brightness-95',
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
