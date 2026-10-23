import * as D from '@radix-ui/react-dialog';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

/** Bottom sheet (28px top radius). No centred modals on mobile. */
export function SheetContent({ className, children, title, description, ...p }: ComponentProps<typeof D.Content> & { title: string; description?: string; children?: ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <D.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] max-h-[92dvh] overflow-y-auto rounded-t-sheet bg-surface p-5 pb-[calc(20px+var(--safe-bottom))] shadow-elev',
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-[420ms] data-[state=open]:ease-[cubic-bezier(0.22,1.25,0.36,1)] data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200',
          className,
        )}
        {...p}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" aria-hidden />
        <D.Title className="text-xl font-semibold leading-[26px] text-ink">{title}</D.Title>
        {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        <div className="mt-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
