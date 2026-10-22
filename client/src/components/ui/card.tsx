import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) =>
  <div className={cn('rounded-card bg-surface shadow-card border border-line/60', className)} {...p} />;
