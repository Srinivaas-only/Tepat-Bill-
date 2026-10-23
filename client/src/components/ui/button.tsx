import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold disabled:pointer-events-none disabled:opacity-50 rounded-btn',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-ink shadow-[inset_0_1px_0_rgb(255_255_255/.22),inset_0_0_0_1px_rgb(255_255_255/.08),0_8px_20px_-8px_rgb(36_87_214/.75)] [@media(hover:hover)]:hover:bg-brand-hover',
        secondary: 'bg-white/[.08] text-ink ring-1 ring-white/10 [@media(hover:hover)]:hover:bg-white/[.12]',
        light: 'bg-[#FAFAFA] text-[#09090B] shadow-[0_8px_24px_-10px_rgb(0_0_0/.6)] [@media(hover:hover)]:hover:bg-white',
        glass: 'bg-white/10 text-ink ring-1 ring-white/15 backdrop-blur [@media(hover:hover)]:hover:bg-white/[.16]',
        ghost: 'bg-transparent text-ink [@media(hover:hover)]:hover:bg-white/[.06]',
        destructive: 'bg-danger text-white shadow-[inset_0_1px_0_rgb(255_255_255/.18)] [@media(hover:hover)]:hover:bg-danger-hover',
        wa: 'bg-wa text-[#09090B] font-semibold [@media(hover:hover)]:hover:brightness-95',
      },
      size: { md: 'h-[52px] px-5 text-base', sm: 'min-h-11 whitespace-normal px-4 py-2 text-center text-sm', icon: 'h-11 w-11' },
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
