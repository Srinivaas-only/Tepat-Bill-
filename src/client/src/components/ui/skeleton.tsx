import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
/** Appears only after 150ms (no flash for fast loads); same size as final content via className. */
export function Skeleton({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  const [show, setShow] = useState(false);
  useEffect(() => { const id = setTimeout(() => setShow(true), 150); return () => clearTimeout(id); }, []);
  return <div aria-hidden className={cn(show ? 'skeleton' : 'bg-transparent', 'rounded-xl', className)} {...p} />;
}
