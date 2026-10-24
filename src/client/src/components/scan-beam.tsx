import { motion } from 'motion/react';

/** One brand line with a soft trail sweeping top to bottom (transform only, linear, 1.4s, looping). */
export function ScanBeam({ fading }: { fading?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <motion.div className="absolute inset-x-0 top-0 h-full" initial={{ y: '-100%', opacity: 1 }}
        animate={fading ? { opacity: 0 } : { y: ['-100%', '0%'], opacity: 1 }}
        transition={fading ? { duration: 0.2 } : { duration: 1.4, ease: 'linear', repeat: Infinity, repeatType: 'loop' }}>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-brand-text/25" />
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-text shadow-[0_0_16px_2px_rgb(147_180_255/.7)]" />
      </motion.div>
    </div>
  );
}
