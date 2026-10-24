import { motion, useReducedMotion } from 'motion/react';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';

const colour: Record<string, string> = { settled: 'var(--ok)', disputed: 'var(--dispute)', dismissed: 'var(--ink-2)', open: 'var(--brand-text)', proposed: 'var(--ink-2)', ok: 'var(--ok)', notord: 'var(--notord)' };

/** Outlined ink stamp. `thunk` plays the one-off press: drops in oversized, lands with one overshoot and a brief ink-bleed ring. `label` overrides the status word. */
export function Stamp({ status, thunk, label, colour: c0 }: { status?: string; thunk?: boolean; label?: string; colour?: string }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const c = c0 ?? colour[status ?? ''] ?? 'var(--ink-2)';
  const play = !!thunk && !reduce;
  return (
    <motion.span
      initial={play ? { scale: 1.35, opacity: 0, rotate: -12, boxShadow: `0 0 0 8px color-mix(in srgb, ${c} 22%, transparent)` } : false}
      animate={{ scale: 1, opacity: 0.92, rotate: -6, boxShadow: `0 0 0 0px color-mix(in srgb, ${c} 0%, transparent)` }}
      transition={play ? { type: 'spring', stiffness: 700, damping: 32, mass: 0.6, boxShadow: { duration: 0.22 } } : { duration: 0 }}
      className="stamp num inline-block rounded-chip border-2 px-2 py-1 text-sm font-semibold uppercase tracking-[.08em]"
      style={{ color: c, borderColor: c, backgroundColor: `color-mix(in srgb, ${c} 10%, transparent)` }}>
      {label ?? t(`status.${status}` as Key)}
    </motion.span>
  );
}
