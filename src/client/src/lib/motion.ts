export const spring = { type: 'spring' as const, stiffness: 420, damping: 32 };
export const sheetSpring = { type: 'spring' as const, stiffness: 260, damping: 26 };
export const listItem = (i: number) => ({
  initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 },
  transition: { ...spring, delay: Math.min(i, 12) * 0.04 },
});
