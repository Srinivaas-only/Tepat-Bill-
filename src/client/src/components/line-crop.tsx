import { useState } from 'react';
import type { Box } from '@shared/schema';

/** 100% x 220px window onto the invoice, zoomed to the flagged line (notes 42). No box -> whole image, uncropped. */
export function LineCrop({ src, width, height, box, onOpen, label }: { src: string; width: number; height: number; box: Box | null; onOpen: () => void; label: string }) {
  const [cw, setCw] = useState(0);
  const H = 220;
  let style: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'contain' };
  let ring: React.CSSProperties | null = null;
  if (box && cw) {
    const [y1, x1, y2, x2] = box;
    const zoom = Math.min(4, Math.max(1, 900 / Math.max(1, x2 - x1)));
    const iw = cw * zoom, ih = (iw * height) / width;
    const cx = ((x1 + x2) / 2 / 1000) * iw, cy = ((y1 + y2) / 2 / 1000) * ih;
    const tx = Math.min(0, Math.max(cw - iw, cw / 2 - cx)), ty = Math.min(0, Math.max(H - ih, H / 2 - cy));
    style = { position: 'absolute', width: iw, height: ih, left: tx, top: ty, maxWidth: 'none' };
    ring = { position: 'absolute', left: tx + (x1 / 1000) * iw, top: ty + (y1 / 1000) * ih, width: ((x2 - x1) / 1000) * iw, height: ((y2 - y1) / 1000) * ih };
  }
  return (
    <button type="button" onClick={onOpen} aria-label={label} ref={el => { if (el && el.clientWidth !== cw) setCw(el.clientWidth); }}
      className="relative block w-full overflow-hidden rounded-card bg-surface-2" style={{ height: H }}>
      <img src={src} alt="" style={style} draggable={false} />
      {ring && <div className="rounded-lg border-2 border-brand bg-brand/10" style={ring} />}
    </button>
  );
}
