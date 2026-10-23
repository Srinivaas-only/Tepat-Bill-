import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Camera, FileUp, FileText, ReceiptText, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/page';
import { ProgressRing } from '@/components/progress-ring';
import { useI18n } from '@/i18n';
import { prepareFile, uploadDocument } from '@/lib/image';
import type { Key } from '@/i18n/ms';

type ScanKind = 'po' | 'invoice' | 'bon';
const kinds: { id: ScanKind; key: Key; icon: typeof FileText }[] = [
  { id: 'po', key: 'scan.po', icon: FileText },
  { id: 'invoice', key: 'scan.invoice', icon: ReceiptText },
  { id: 'bon', key: 'scan.bon', icon: Truck },
];

export default function Scan() {
  const { t } = useI18n();
  const [, nav] = useLocation();
  const [kind, setKind] = useState<ScanKind | null>(null);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'uploading'>('idle');
  const [pct, setPct] = useState(0);
  const [thumb, setThumb] = useState<string | null>(null);
  const [note, setNote] = useState(false);
  const snap = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  const onFile = async (f?: File) => {
    if (!f || !kind) return;
    try {
      setPhase('preparing');
      const p = await prepareFile(f);
      setThumb(URL.createObjectURL(p.blob));
      setNote(p.note === 'page1' && p.pageCount > 1);
      setPhase('uploading'); setPct(0);
      const docKind = kind === 'bon' ? 'delivery_note' : kind;
      const up = await uploadDocument(p, { kind: docKind, ...(kind === 'bon' ? { photoKind: 'signed_bon' } : {}) }, setPct);
      nav(kind === 'bon' ? `/bon/${up.id}` : `/read/${up.id}`);
    } catch {
      toast.error(t('scan.failed'));
      setPhase('idle');
    }
  };
  const busy = phase !== 'idle';

  return (
    <Page title={kind ? t(kinds.find(k => k.id === kind)!.key) : t('nav.scan')}>
      <Sheet open={!kind} onOpenChange={o => { if (!o) nav('/'); }}>
        <SheetContent title={t('scan.what')}>
          <div className="space-y-3">
            {kinds.map(k => (
              <Button key={k.id} variant="secondary" block className="h-16 justify-start gap-4 text-lg" onClick={() => setKind(k.id)}>
                <k.icon size={26} strokeWidth={1.5} className="text-brand" aria-hidden />{t(k.key)}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {kind && (
        <div className="flex flex-col items-center gap-5">
          <div className="flex aspect-[3/4] w-full max-w-[320px] items-center justify-center overflow-hidden rounded-card border border-dashed border-line bg-surface">
            {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain" /> : <p className="px-6 text-center text-ink-2">{t('scan.pickSource')}</p>}
          </div>
          {busy && (
            <div className="flex items-center gap-3 text-ink-2" aria-live="polite">
              {phase === 'uploading' ? <ProgressRing pct={pct} /> : null}
              <span>{phase === 'uploading' ? t('scan.uploading') : t('scan.preparing')}</span>
            </div>
          )}
          {note && <p className="text-sm font-medium text-short">{t('scan.page1')}</p>}
          <div className="grid w-full grid-cols-2 gap-3">
            <Button disabled={busy} onClick={() => snap.current?.click()}><Camera size={20} aria-hidden />{t('scan.snap')}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => file.current?.click()}><FileUp size={20} aria-hidden />{t('scan.file')}</Button>
          </div>
          <input ref={snap} type="file" accept="image/*" capture="environment" hidden onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={file} type="file" accept="image/*,application/pdf" hidden onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
    </Page>
  );
}
