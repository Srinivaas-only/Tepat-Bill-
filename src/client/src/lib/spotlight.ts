/** One delegated pointermove for every `.spot` element: writes --mx/--my in an rAF (CSS draws the glow; zero re-renders). Desktop pointers only. */
export function initSpotlight() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let raf = 0, x = 0, y = 0, target: HTMLElement | null = null;
  document.addEventListener('pointermove', e => {
    const el = (e.target as HTMLElement | null)?.closest?.('.spot') as HTMLElement | null;
    if (!el) return;
    target = el; x = e.clientX; y = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!target) return;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${x - r.left}px`);
      target.style.setProperty('--my', `${y - r.top}px`);
    });
  }, { passive: true });
}
