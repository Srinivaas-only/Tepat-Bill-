import * as T from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export const Tabs = T.Root;
export const TabsList = ({ className, ...p }: ComponentProps<typeof T.List>) =>
  <T.List className={cn('flex gap-1 rounded-2xl bg-surface-2 p-1', className)} {...p} />;
export const TabsTrigger = ({ className, ...p }: ComponentProps<typeof T.Trigger>) =>
  <T.Trigger className={cn('flex flex-1 items-center justify-center min-h-11 rounded-xl px-3 text-sm font-semibold text-ink-2 transition-colors data-[state=active]:bg-surface data-[state=active]:text-ink ', className)} {...p} />;
export const TabsContent = T.Content;
