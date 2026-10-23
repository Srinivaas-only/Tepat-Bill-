import * as T from '@radix-ui/react-tabs';
import { createContext, useContext, useId, type ComponentProps } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

const Ctx = createContext<{ value?: string; id: string }>({ id: 'tabs' });
/** Segmented control: a white pill glides between triggers (shared layout, spring). Works with controlled `value`. */
export const Tabs = ({ value, ...p }: ComponentProps<typeof T.Root>) => { const id = useId(); return <Ctx.Provider value={{ value, id }}><T.Root value={value} {...p} /></Ctx.Provider>; };
export const TabsList = ({ className, ...p }: ComponentProps<typeof T.List>) =>
  <T.List className={cn('flex gap-1 rounded-card bg-surface-2 p-1 ring-1 ring-ink/5', className)} {...p} />;
export const TabsTrigger = ({ className, children, value, ...p }: ComponentProps<typeof T.Trigger>) => {
  const c = useContext(Ctx); const active = c.value === value;
  return (
    <T.Trigger value={value} className={cn('press relative isolate flex flex-1 items-center justify-center whitespace-nowrap min-h-11 rounded-[10px] px-2 text-sm font-medium text-ink-2 transition-colors data-[state=active]:font-semibold data-[state=active]:text-ink', className)} {...p}>
      {active && <motion.span layoutId={`pill-${c.id}`} aria-hidden className="absolute inset-0 -z-10 rounded-[10px] bg-surface shadow-[0_0_0_1px_rgba(19,37,74,.06),0_2px_6px_-2px_rgba(19,37,74,.18)]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
      {children}
    </T.Trigger>
  );
};
export const TabsContent = T.Content;
