import { motion, useReducedMotion } from 'motion/react';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';

const colour: Record<string, string> = { settled: 'var(--ok)', disputed: 'var(--dispute)', dismissed: 'var(--ink-2)', open: 'var(--brand)', proposed: 'var(--ink-2)' };

/** Outlined, slightly rotated ink stamp. `thunk` plays the one-off press animation. */
export function Stamp({ status, thunk }: { status: string; thunk?: boolean }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const c = colour[status] ?? 'var(--ink-2)';
  return (
    <motion.span
      initial={thunk && !reduce ? { scale: 1.15, opacity: 0 } : false} animate={{ scale: 1, opacity: 0.9 }} transition={{ duration: 0.16 }}
      className="num inline-block -rotate-6 rounded-md border-2 px-2 py-0.5 text-sm font-semibold uppercase tracking-[.08em] mix-blend-multiply"
      style={{ color: c, borderColor: c }}>
      {t(`status.${status}` as Key)}
    </motion.span>
  );
}
