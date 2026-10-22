import { motion } from 'motion/react';

/** 2px brand line with a 96px trailing gradient, sweeping top to bottom (1.6s ease-in-out loop). */
export function ScanBeam({ fading }: { fading?: boolean }) {
  return (
    <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 z-10" initial={{ top: '0%', opacity: 1 }}
      animate={fading ? { opacity: 0 } : { top: ['0%', '100%'], opacity: 1 }}
      transition={fading ? { duration: 0.2 } : { duration: 1.6, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}>
      <div className="absolute inset-x-0 bottom-0 h-24" style={{ background: 'linear-gradient(to top, color-mix(in srgb, var(--brand) 30%, transparent), transparent)' }} />
      <div className="relative h-0.5 bg-brand shadow-[0_0_12px_var(--brand)]" />
    </motion.div>
  );
}
