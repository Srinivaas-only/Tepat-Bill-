import { useState } from 'react';
import { useParams } from 'wouter';
import { tokenOverlap } from '@shared/core';
import { useQuery } from '@tanstack/react-query';
import { Money } from '@/components/ui/money';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Stamp } from '@/components/stamp';
import { Logo } from '@/components/logo';
import { PhotoViewer } from '@/components/photo-viewer';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { formatMoney } from '@/lib/money-input';
import { SectionLabel } from '@/components/page';

interface Payload {
  stage?: 'invoice' | 'delivery';
  flag: { type: 'short_qty' | 'price_change' | 'not_ordered'; amountSen: number; status: string };
  po: { poNo: string; lines: { sku: string; description: string; orderedQty: number }[] } | null;
  invoice: { invoiceNo: string; lines: { lineId: string; description: string; qty: number; unitPriceSen: number }[] };
  baseline: { unitSen: number; source: string } | null;
  photos: { id: string; kind: string; url: string }[];
  highlight: { invoiceLineId: string; box_2d: [number, number, number, number] | null };
  siblings: { type: string; description: string; amountSen: number; status: string }[];
  shopName: string; supplierName: string; invoiceDocDate: string; invoiceDoc: { width: number; height: number } | null;
}

async function load(token: string): Promise<Payload> {
  const r = await fetch(`/api/public/evidence/${token}`).catch(() => { throw new Error('network'); });
  if (!r.ok) throw new Error(r.status === 404 ? 'not_found' : 'network');
  return r.json();
}

function Highlighted({ src, box, size, alt, onOpen }: { src: string; box: [number, number, number, number] | null; size: { width: number; height: number } | null; alt: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="relative block w-full overflow-hidden rounded-card bg-surface-2" style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}>
      <img src={src} alt={alt} fetchPriority="high" decoding="async" className={size ? 'absolute inset-0 h-full w-full object-fill' : 'block w-full'} />
      {box && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
          <rect x={box[1]} y={box[0]} width={box[3] - box[1]} height={box[2] - box[0]} rx={6} fill="var(--brand)" fillOpacity={0.16} stroke="var(--brand)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </button>
  );
}

export default function Evidence() {
  const { token } = useParams<{ token: string }>();
  const { t, lang, setLang } = useI18n();
  const [viewer, setViewer] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['evidence', token], queryFn: () => load(token), retry: (n, e) => (e as Error).message !== 'not_found' && n < 2 });
  const d = q.data;
  const bon = d?.stage === 'delivery';
  const dateFmt = (iso: string) => iso.split('-').reverse().join('/');
  const line = d?.invoice.lines.find(l => l.lineId === d.highlight.invoiceLineId);
  const poLine = line && d?.po ? [...d.po.lines].map(l => ({ l, o: tokenOverlap(line.description, l.description) })).sort((a, b) => b.o - a.o).filter(x => x.o >= 0.6)[0]?.l : undefined;
  const invoicePhoto = d?.photos.find(p => p.kind === 'invoice');
  const others = d?.photos.filter(p => p !== invoicePhoto) ?? [];
  return (
    <main className="mx-auto min-h-dvh max-w-[480px] px-5 pb-10 pt-5">
      <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><Logo size={28} /><p className="text-[11px] font-medium uppercase tracking-[.12em] text-ink-2">{t('evidence.kicker')}</p></div>
        <Button variant="secondary" size="sm" onClick={() => setLang(lang === 'ms' ? 'en' : 'ms')}>{lang === 'ms' ? 'English' : 'BM'}</Button></div>
      {q.isError ? <div className="space-y-3 rounded-card border border-line p-5"><p className="text-ink-2">{(q.error as Error).message === 'not_found' ? t('ev.notFound') : t('evidence.netErr')}</p>{(q.error as Error).message !== 'not_found' && <Button variant="secondary" onClick={() => void q.refetch()}>{t('evidence.retry')}</Button>}</div> : !d ? <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-60 w-full" /></div> : (
        <div className="space-y-4">
          <div className="space-y-1 border-b border-dashed border-line pb-4">
            <h1 className="text-2xl font-semibold leading-8">{t('evidence.title')}</h1>
            <p className="num text-sm text-ink-2">{t('evidence.refInvoice', { no: d.invoice.invoiceNo, date: dateFmt(d.invoiceDocDate) })}</p>
            <p className="text-ink-2">{t(bon ? 'ev.from.delivery' : 'ev.from', { shop: d.shopName, no: d.invoice.invoiceNo })}</p>
            <p className="text-sm text-ink-2">{d.supplierName}</p>
          </div>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2"><p className="text-sm text-ink-2">{t(`ev.type.${d.flag.type}` as Key)}</p><Stamp status={d.flag.status} /></div>
            <p className="mt-1 font-semibold leading-6">{line?.description}</p>
            <Money sen={d.flag.amountSen} className="mt-2 text-[32px] font-semibold leading-10" />
            <dl className="mt-3 divide-y divide-dashed divide-line text-sm">
              {line && <div className="flex justify-between py-2"><dt className="text-ink-2">{t('flag.billed')}</dt><dd className="num font-semibold">{line.qty} × {formatMoney(line.unitPriceSen, 'MYR')}</dd></div>}
              {d.baseline && <div className="flex justify-between py-2"><dt className="text-ink-2">{t('ev.baseline')} ({t(`flag.src.${d.baseline.source}` as Key)})</dt><dd className="num font-semibold">{formatMoney(d.baseline.unitSen, 'MYR')}</dd></div>}
            </dl>
          </Card>

          {invoicePhoto && <section><SectionLabel>{bon ? t('evidence.bonTitle') : t('ev.invoice')} <span className="num">{d.invoice.invoiceNo}</span></SectionLabel><Highlighted src={invoicePhoto.url} box={d.highlight.box_2d} size={d.invoiceDoc} alt={t('ev.invoiceAlt', { no: d.invoice.invoiceNo })} onOpen={() => setViewer(invoicePhoto.url)} /></section>}

          {line && d.po && (
            <section><SectionLabel>{t('ev.compare')}</SectionLabel>
              <Card className="grid grid-cols-2 divide-x divide-line text-sm">
                <div className="p-3"><p className="text-xs text-ink-2">{t('ev.poCol')}</p>
                  <p className="font-medium">{poLine?.description ?? t('ev.notInPo')}</p><p className="num text-ink-2">{poLine ? `${poLine.orderedQty}` : '—'}</p></div>
                <div className="p-3"><p className="text-xs text-ink-2">{t('ev.invCol')}</p>
                  <p className="font-medium">{line.description}</p><p className="num text-ink-2">{line.qty} × {formatMoney(line.unitPriceSen, 'MYR')}</p></div>
              </Card>
            </section>
          )}

          {d.po && (
            <section><SectionLabel>{t('ev.po', { no: d.po.poNo })}</SectionLabel>
              <Card className="divide-y divide-dashed divide-line px-4">{d.po.lines.map(l => <div key={l.sku} className="flex justify-between gap-3 py-2 text-sm"><span>{l.description}</span><span className="num font-semibold">{l.orderedQty}</span></div>)}</Card></section>
          )}

          <section><SectionLabel>{t('ev.photos')}</SectionLabel>
            {others.length === 0 ? <p className="text-ink-2">{t('ev.noPhotos')}</p> : (
              <div className="grid grid-cols-2 gap-3">{others.map(p => (
                <button key={p.id} type="button" onClick={() => setViewer(p.url)} className="overflow-hidden rounded-card bg-surface-2 text-left">
                  <img src={p.url} alt={t(`ev.kind.${p.kind}` as Key)} className="aspect-square w-full object-cover" loading="lazy" /><span className="block px-3 py-2 text-xs text-ink-2">{t(`ev.kind.${p.kind}` as Key)}</span>
                </button>))}</div>
            )}
          </section>

          {d.siblings.length > 0 && (
            <section><SectionLabel>{t('ev.also')}</SectionLabel>
              <div className="space-y-2">{d.siblings.map((s, i) => <Card key={i} className="flex items-center justify-between gap-3 p-3"><span className="text-sm">{s.description}</span><span className="flex items-center gap-2"><Money sen={s.amountSen} className="font-semibold" /><Badge tone={s.type === 'short_qty' ? 'short' : s.type === 'price_change' ? 'price' : 'notord'}>{t(`status.${s.status}` as Key)}</Badge></span></Card>)}</div></section>
          )}
        </div>
      )}
      {d && <p className="mt-8 text-center text-xs text-ink-2">{t('evidence.readOnly')}</p>}
      <PhotoViewer src={viewer} onClose={() => setViewer(null)} box={viewer && viewer === invoicePhoto?.url ? d?.highlight.box_2d : null} />
    </main>
  );
}
