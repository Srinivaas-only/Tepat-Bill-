import * as T from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export const Tabs = T.Root;
export const TabsList = ({ className, ...p }: ComponentProps<typeof T.List>) =>
  <T.List className={cn('flex border-b border-line', className)} {...p} />;
export const TabsTrigger = ({ className, ...p }: ComponentProps<typeof T.Trigger>) =>
  <T.Trigger className={cn('relative flex flex-1 items-center justify-center whitespace-nowrap min-h-11 px-2 text-sm font-medium text-ink-2 after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] data-[state=active]:text-ink data-[state=active]:after:bg-ink', className)} {...p} />;
export const TabsContent = T.Content;
