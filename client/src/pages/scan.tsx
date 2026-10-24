import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Camera, FileUp, FileText, ReceiptText, Truck, Paperclip, PenLine, Sparkles } from 'lucide-react';
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

/** Synthetic sample documents (fixtures/docs, served by /api/samples) so a judge can try every scan type without photos of their own. */
const SAMPLES: Record<ScanKind, { file: string; ms: string; en: string }[]> = {
  po: [
    { file: 'po_notebook_borong_ali.png', ms: 'Nota pesanan tulisan tangan', en: 'Handwritten order notebook' },
    { file: 'po_whatsapp_kilang_roti_sinar.png', ms: 'Pesanan WhatsApp', en: 'WhatsApp order' },
  ],
  invoice: [
    { file: 'invoice_borong_ali_INV-2291.png', ms: 'Invois Borong Ali (ada perbezaan)', en: 'Borong Ali invoice (has differences)' },
    { file: 'invoice_lim_brothers_LB-7810.png', ms: 'Invois Lim Brothers (tepat)', en: 'Lim Brothers invoice (correct)' },
    { file: 'invoice_kilang_roti_sinar_0118.png', ms: 'Bil tunai (barang diganti)', en: 'Cash bill (substituted item)' },
    { file: 'invoice_foreign_GZ-2026-088.png', ms: 'Invois pembekal luar negara', en: 'Foreign supplier invoice' },
  ],
  delivery: [
    { file: 'do_lim_brothers_DO-LB-0901.png', ms: 'Bon Lim Brothers (tepat)', en: 'Lim Brothers delivery order (correct)' },
    { file: 'bon_signed_DO-5512.png', ms: 'Bon bertandatangan (Maggi 8 sahaja)', en: 'Signed bon (only 8 Maggi)' },
  ],
  bon: [
    { file: 'delivery_photo_INV-2291.png', ms: 'Gambar penghantaran', en: 'Delivery photo' },
    { file: 'bon_signed_DO-5512.png', ms: 'Bon bertandatangan', en: 'Signed bon' },
  ],
};

export default function Scan() {
  const { t, lang } = useI18n();
  const [, nav] = useLocation();
  const [kind, setKindState] = useState<ScanKind | null>(null);
  const kindRef = useRef<ScanKind | null>(null);
  const setKind = (k: ScanKind | null) => { kindRef.current = k; setKindState(k); };
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'uploading'>('idle');
  const [pct, setPct] = useState(0);
  const [thumb, setThumb] = useState<string | null>(null);
  const [note, setNote] = useState(false);
  const snap = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);

  const onFile = async (f?: File, forced?: ScanKind) => {
    const kind = forced ?? kindRef.current;
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
  const useSample = async (k: ScanKind, file: string) => {
    try {
      setKind(k); setPhase('preparing');
      const res = await fetch(`/api/samples/${file}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('sample');
      await onFile(new File([await res.blob()], file, { type: 'image/png' }), k);
    } catch { toast.error(t('scan.failed')); setPhase('idle'); }
  };

  return (
    <Page title={kind ? t(kinds.find(k => k.id === kind)!.key) : t('nav.scan')}>
      <Sheet open={!kind} onOpenChange={o => { if (!o) nav('/'); }}>
        <SheetContent title={t('scan.what')}>
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            {kinds.map(k => (
              <button key={k.id} type="button" onClick={() => choose(k.id)} className="press flex min-h-16 w-full items-center gap-4 border-t border-line px-4 py-3 text-left first:border-t-0 [@media(hover:hover)]:hover:bg-surface-2/60">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-text/10 text-brand-text" aria-hidden><k.icon size={22} strokeWidth={1.75} /></span>
                <span className="min-w-0"><span className="block text-base font-medium leading-5">{t(k.key)}</span><span className="block text-sm text-ink-2">{t(k.hint)}</span></span>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-card border border-brand-text/30 bg-brand-text/[.06] p-3">
            <p className="mb-2 text-sm font-semibold text-ink">{t('scan.noPhoto')}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['po', 'invoice', 'delivery'] as const).map(k => (
                <Button key={k} type="button" variant="secondary" block className="h-auto min-h-12 whitespace-normal py-2 text-center leading-5" onClick={() => nav(`/review/${k}/new`)}><PenLine size={16} aria-hidden />{t('scan.manual')} · {t(kinds.find(x => x.id === k)!.key)}</Button>
              ))}
            </div>
          </div>
          <details className="mt-3 rounded-card bg-surface p-3" open>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink"><Sparkles size={16} className="text-brand-text" aria-hidden />{t('scan.samples')}</summary>
            <p className="mb-2 text-xs text-ink-2">{t('scan.samplesHint')}</p>
            <div className="space-y-3">
              {kinds.map(k => (
                <div key={k.id}>
                  <p className="eyebrow mb-1">{t(k.key)}</p>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLES[k.id].map(sm => (
                      <button key={sm.file + k.id} type="button" disabled={busy} onClick={() => void useSample(k.id, sm.file)} className="press inline-flex min-h-11 items-center rounded-full bg-surface-2 px-3 text-sm font-medium text-ink ring-1 ring-white/10">{lang === 'ms' ? sm.ms : sm.en}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
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
