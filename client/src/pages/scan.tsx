import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Camera, FileUp, FileText, ReceiptText, Truck, Paperclip, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/page';
import { ProgressRing } from '@/components/progress-ring';
import { useI18n } from '@/i18n';
import { prepareFile, uploadDocument } from '@/lib/image';
import type { Key } from '@/i18n/ms';

type ScanKind = 'po' | 'invoice' | 'delivery' | 'bon';
const kinds: { id: ScanKind; key: Key; hint: Key; icon: typeof FileText }[] = [
  { id: 'po', key: 'scan.po', hint: 'scan.po.hint', icon: FileText },
  { id: 'invoice', key: 'scan.invoice', hint: 'scan.invoice.hint', icon: ReceiptText },
  { id: 'delivery', key: 'scan.delivery.new', hint: 'scan.bon.hint', icon: Truck },
  { id: 'bon', key: 'scan.delivery.attach', hint: 'scan.attach.hint', icon: Paperclip },
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
      const bonLike = kind === 'bon' || kind === 'delivery';
      const up = await uploadDocument(p, { kind: bonLike ? 'delivery_note' : kind, ...(bonLike ? { photoKind: 'signed_bon' } : {}) }, setPct);
      nav(kind === 'bon' ? `/bon/${up.id}` : `/read/${up.id}`);
    } catch {
      toast.error(t('scan.failed'));
      setPhase('idle');
    }
  };
  const busy = phase !== 'idle';

  const choose = (k: ScanKind) => { setKind(k); snap.current?.click(); };

  return (
    <Page title={kind ? t(kinds.find(k => k.id === kind)!.key) : t('nav.scan')}>
      <Sheet open={!kind} onOpenChange={o => { if (!o) nav('/'); }}>
        <SheetContent title={t('scan.what')}>
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {kinds.map(k => (
              <button key={k.id} type="button" onClick={() => choose(k.id)} className="press flex min-h-16 w-full items-center gap-4 border-t border-dashed border-line px-4 py-3 text-left first:border-t-0 [@media(hover:hover)]:hover:bg-surface-2/60">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand/10 text-brand" aria-hidden><k.icon size={22} strokeWidth={1.75} /></span>
                <span className="min-w-0"><span className="block text-base font-medium leading-5">{t(k.key)}</span><span className="block text-sm text-ink-2">{t(k.hint)}</span></span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 border-t border-line pt-1">
            {(['po', 'invoice', 'delivery'] as const).map(k => (
              <button key={k} type="button" onClick={() => nav(`/review/${k}/new`)} className="press inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-2"><PenLine size={14} aria-hidden />{t('scan.manual')} · {t(kinds.find(x => x.id === k)!.key)}</button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {kind && (
        <div className="flex flex-col gap-4">
          {thumb && <div className="mx-auto aspect-[3/4] w-full max-w-[320px] overflow-hidden rounded-card bg-surface shadow-card"><img src={thumb} alt={t(kinds.find(k => k.id === kind)!.key)} className="h-full w-full object-contain" /></div>}
          {busy && (
            <div className="flex items-center gap-3 text-ink-2" aria-live="polite">
              {phase === 'uploading' ? <ProgressRing pct={pct} /> : null}
              <span>{phase === 'uploading' ? t('scan.uploading') : t('scan.preparing')}</span>
            </div>
          )}
          {note && <p className="text-sm font-medium text-short">{t('scan.page1')}</p>}
          <div className="flex flex-col gap-2">
            <Button block disabled={busy} onClick={() => snap.current?.click()}><Camera size={20} aria-hidden />{t('scan.snap')}</Button>
            <Button block variant="secondary" disabled={busy} onClick={() => file.current?.click()}><FileUp size={20} aria-hidden />{t('scan.file')}</Button>
            <Button block variant="ghost" disabled={busy} onClick={() => setKind(null)}>{t('common.back')}</Button>
          </div>
        </div>
      )}
      <input ref={snap} type="file" accept="image/*" capture="environment" hidden onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={file} type="file" accept="image/*,application/pdf" hidden onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </Page>
  );
}
