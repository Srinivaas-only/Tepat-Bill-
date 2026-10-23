import { motion } from 'motion/react';

/** `draw`: the receipt outlines itself, fills, then the check strokes in (once, ~1.2s). */
export function Logo({ size = 56, draw }: { size?: number; draw?: boolean }) {
  const d = !!draw;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" role="img" aria-label="Tepat Bill">
      <rect width="56" height="56" rx="16" fill="#18181B" />
      <rect x=".5" y=".5" width="55" height="55" rx="15.5" fill="none" stroke="#fff" strokeOpacity=".14" />
      <motion.path d="M17 14h22v28l-4-3-3.5 3-3.5-3-3.5 3-3.5-3-4 3V14z" fill="#FAFAFA" initial={d ? { fillOpacity: 0, pathLength: 0 } : false} animate={{ fillOpacity: 1, pathLength: 1 }} stroke="#FAFAFA" strokeWidth="1" transition={{ pathLength: { duration: 0.7, ease: 'easeInOut' }, fillOpacity: { delay: 0.55, duration: 0.35 } }} />
      <motion.path d="M22 26l4 4 8-9" fill="none" stroke="#2457D6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={d ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ delay: d ? 0.9 : 0, duration: 0.4, ease: 'easeOut' }} />
    </svg>
  );
}
