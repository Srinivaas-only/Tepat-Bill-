import * as D from '@radix-ui/react-dialog';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { X } from 'lucide-react';
import { useI18n } from '@/i18n';

/** Full-screen pinch/zoom viewer. */
/** `box` = [ymin,xmin,ymax,xmax] in 0-1000, drawn over the zoomed image. */
export function PhotoViewer({ src, onClose, box }: { src: string | null; onClose: () => void; box?: [number, number, number, number] | null }) {
  const { t } = useI18n();
  return (
    <D.Root open={!!src} onOpenChange={o => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-ink/90" />
        <D.Content className="fixed inset-0 z-[60] flex items-center justify-center" aria-describedby={undefined}>
          <D.Title className="sr-only">{t('flag.photos')}</D.Title>
          {src && (
            <TransformWrapper minScale={1} maxScale={5} doubleClick={{ mode: 'zoomIn' }}>
              <TransformComponent wrapperStyle={{ width: '100vw', height: '100dvh' }} contentStyle={{ width: '100vw', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="relative inline-block">
                  <img src={src} alt="" className="block max-h-[100dvh] max-w-[100vw] object-contain" draggable={false} />
                  {box && (
                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
                      <rect className="hl-pulse" x={box[1]} y={box[0]} width={box[3] - box[1]} height={box[2] - box[0]} rx={6} fill="var(--brand)" stroke="var(--brand)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                    </svg>
                  )}
                </div>
              </TransformComponent>
            </TransformWrapper>
          )}
          <D.Close aria-label={t('common.close')} className="absolute right-4 top-[calc(12px+var(--safe-top,0px))] flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink"><X size={22} /></D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
