import { motion, useReducedMotion } from 'motion/react';
import type { Box } from '@shared/schema';

/** Document image with SVG overlay. Boxes are [ymin,xmin,ymax,xmax] in 0-1000; drawn in image pixel space. */
export function DocImage({ src, width, height, alt, boxes = [], drawFrom, stagger = 0.12, activeIndex, onBoxClick, layoutId, className, maxHeight }: {
  src: string; width: number; height: number; alt: string; boxes?: (Box | null | undefined)[];
  /** when set, boxes draw in (stroke-dashoffset) starting at this delay */
  drawFrom?: number; stagger?: number; activeIndex?: number | null; onBoxClick?: (i: number) => void; layoutId?: string; className?: string; maxHeight?: string;
}) {
  const reduce = useReducedMotion();
  const sw = Math.max(2, width / 190);
  return (
    <motion.div className={`relative overflow-hidden rounded-card bg-surface-2 ${className ?? ''}`} style={{ aspectRatio: `${width} / ${height}`, ...(maxHeight ? { width: `min(100%, calc(${maxHeight} * ${width / height}))`, marginInline: 'auto' } : {}) }}>
      <img src={src} alt={alt} width={width} height={height} className="absolute inset-0 h-full w-full object-fill" draggable={false} />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        {boxes.map((b, i) => {
          if (!b) return null;
          const [y1, x1, y2, x2] = b;
          const x = (x1 / 1000) * width, y = (y1 / 1000) * height, w = ((x2 - x1) / 1000) * width, h = ((y2 - y1) / 1000) * height;
          const active = activeIndex === i;
          const delay = drawFrom ?? 0; void i; void stagger;   // every box draws in together (no stagger)
          return (
            <g key={i} id={`line-${i}`} onClick={() => onBoxClick?.(i)} style={{ cursor: onBoxClick ? 'pointer' : undefined }}>
              <motion.rect x={x} y={y} width={w} height={h} rx={sw * 1.5} fill="var(--brand)" initial={{ fillOpacity: 0 }}
                animate={{ fillOpacity: active ? 0.22 : 0.12 }} transition={{ delay, duration: reduce ? 0.15 : 0.45 }} />
              <motion.rect x={x} y={y} width={w} height={h} rx={sw * 1.5} fill="none" stroke="var(--brand)" strokeWidth={active ? sw * 1.6 : sw}
                pathLength={1} strokeDasharray={1}
                initial={{ strokeDashoffset: reduce ? 0 : 1, opacity: reduce ? 0 : 1 }} animate={{ strokeDashoffset: 0, opacity: 1 }}
                transition={{ delay, duration: reduce ? 0.15 : 0.45, ease: 'easeOut' }} />
            </g>
          );
        })}
      </svg>
    </motion.div>
  );
}
