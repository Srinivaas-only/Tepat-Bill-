import { motion } from 'motion/react';

/** One 2px brand line sweeping top to bottom (linear, 1.4s, looping). */
export function ScanBeam({ fading }: { fading?: boolean }) {
  return (
    <motion.div aria-hidden className="pointer-events-none absolute inset-x-0 z-10" initial={{ top: '0%', opacity: 1 }}
      animate={fading ? { opacity: 0 } : { top: ['0%', '100%'], opacity: 1 }}
      transition={fading ? { duration: 0.2 } : { duration: 1.4, ease: 'linear', repeat: Infinity, repeatType: 'loop' }}>
      <div className="h-0.5 bg-brand" />
    </motion.div>
  );
}
