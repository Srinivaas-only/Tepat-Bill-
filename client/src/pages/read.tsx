import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FlaskConical, PenLine } from 'lucide-react';
import { formatRM, parseRM } from '@shared/core';
import type { ExtractedDoc } from '@shared/core/extract';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { FixedBar } from '@/components/fixed-bar';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { DocImage } from '@/components/doc-image';
import { BackButton } from '@/components/page';
import { ScanBeam } from '@/components/scan-beam';
import { buzz } from '@/lib/haptics';
import type { Key } from '@/i18n/ms';

interface DocMeta { id: string; kind: 'po' | 'invoice' | 'delivery_note' | 'photo'; width: number; height: number }
type ReadResult = { status: 'ok'; model: string; cached: boolean; doc: ExtractedDoc } | { status: 'manual'; reason: string };
interface Fixture { name: string; docType: string; supplierName: string; docNo: string | null }

const MIN_BEAM_MS = 1400;
/** `?hold=<ms>` lengthens the beam (max 10s) so the reading moment can be inspected/tested; never shortens it below 1.4s. */
const holdMs = () => Math.min(10_000, Math.max(MIN_BEAM_MS, Number(new URLSearchParams(location.search).get('hold')) || 0));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const statuses: Key[] = ['read.status1', 'read.status2', 'read.status3'];

export default function Read() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const [, nav] = useLocation();
  const reduce = useReducedMotion();
  const [rev, setRev] = useState(0);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [slow, setSlow] = useState(false);
  const [statusI, setStatusI] = useState(0);
  const [ready, setReady] = useState(false);
  const [picker, setPicker] = useState(false);
  const fixtureChosen = useRef(false);
  const [beamOn, setBeamOn] = useState(true);

  const meta = useQuery({ queryKey: ['doc', id, rev], queryFn: () => api.get<DocMeta>(`/documents/${id}`) });
  const demo = useQuery({ queryKey: ['fixtures-on'], queryFn: () => api.get<{ fixtures: Fixture[] }>('/fixtures'), retry: false, staleTime: Infinity });
  const kind = meta.data?.kind === 'po' ? 'po' : meta.data?.kind === 'delivery_note' ? 'delivery' : 'invoice';

  const extract = useMutation({
    mutationFn: async () => {
      const [r] = await Promise.all([api.post<ReadResult>(`/documents/${id}/extract`), sleep(holdMs())]);
      return r;
    },
    onSuccess: r => { if (!fixtureChosen.current) setResult(r); },
    onError: () => { if (!fixtureChosen.current) setResult({ status: 'manual', reason: 'network' }); },
  });
  useEffect(() => { extract.mutate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  useEffect(() => {
    if (result) return;
    const a = setInterval(() => setStatusI(i => (i + 1) % statuses.length), 1800);
    const b = setTimeout(() => setSlow(true), 7_000);
    const c = setTimeout(() => setResult(r => r ?? { status: 'manual', reason: 'timeout' }), 45_000);
    return () => { clearInterval(a); clearTimeout(b); clearTimeout(c); };
  }, [result]);

  // keep the beam mounted for 200ms (fading) once the result lands
  useEffect(() => {
    if (!result) { setBeamOn(true); return; }
    const tm = setTimeout(() => setBeamOn(false), 200);
    return () => clearTimeout(tm);
  }, [result]);

  const doc = result?.status === 'ok' ? result.doc : null;
  const lines = doc?.lines ?? [];
  // After the last row lands (+500ms) the review CTA appears.
  useEffect(() => {
    if (!doc) return;
    const total = (reduce ? 0.15 : lines.length * 0.12 + 0.45) * 1000 + 500;
    const tm = setTimeout(() => { setReady(true); buzz(8); }, total);
    return () => clearTimeout(tm);
  }, [doc, lines.length, reduce]);

  const useFixture = useMutation({
    mutationFn: (fixture: string) => api.post<ReadResult>(`/documents/${id}/use-fixture`, { fixture }),
    onSuccess: r => { setPicker(false); setRev(v => v + 1); setReady(false); setResult(r); },
    onError: () => { fixtureChosen.current = false; },
  });
  const boxes = useMemo(() => lines.map(l => l.box_2d ?? null), [lines]);
  const goReview = () => nav(`/review/${kind}/${id}`, { replace: true });
  const imgSrc = `/api/documents/${id}/file?v=${rev}`;
  const fixtures = (demo.data?.fixtures ?? []).filter(f => (kind === 'po' ? f.docType === 'purchase_order' : kind === 'delivery' ? f.docType === 'delivery_note' : f.docType === 'invoice'))
    .sort((a, b) => Number(b.docNo === (result?.status === 'ok' ? result.doc.docNo : null)) - Number(a.docNo === (result?.status === 'ok' ? result.doc.docNo : null)));
  const reading = !result;

  return (
    <main className="px-5 pb-32 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/scan" />
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{reading ? t('read.reading') : doc ? t('read.lines', { n: lines.length }) : t('read.manual')}</h1>
        {result?.status === 'ok' && result.model === 'fixture' && <Badge tone="brand"><FlaskConical size={12} aria-hidden />{t('read.demoChip')}</Badge>}
      </div>

      {meta.data ? (
        <div className="relative">
          <DocImage src={imgSrc} width={meta.data.width || 900} height={meta.data.height || 1180} alt={t(kind === 'po' ? 'scan.po' : kind === 'delivery' ? 'scan.bon' : 'scan.invoice')}
            boxes={boxes} drawFrom={doc ? 0 : undefined} maxHeight="52dvh" />
          {beamOn && !reduce && <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-card"><ScanBeam fading={!reading} /></div>}
        </div>
      ) : <Skeleton className="aspect-[3/4] w-full rounded-card" />}

      {reading && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="relative h-6">
            <AnimatePresence mode="wait">
              <motion.p key={slow ? 'slow' : statusI} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute font-medium text-ink-2">
                {slow ? t('read.still') : t(statuses[statusI])}
              </motion.p>
            </AnimatePresence>
          </div>
          {reduce && [0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          {slow && demo.data && <Button variant="secondary" size="sm" onClick={() => setPicker(true)}><FlaskConical size={16} aria-hidden />{t('read.useDemo')}</Button>}
        </div>
      )}

      {doc && (
        <div className="mt-4 overflow-hidden rounded-card bg-surface shadow-card">
          <p className="border-b border-dashed border-line px-4 py-2 text-[11px] font-medium uppercase tracking-[.1em] text-ink-2">{t(kind === 'delivery' ? 'ledger.head.qty' : 'ledger.head.price')}</p>
          {lines.length === 0 && <p className="px-4 py-3 text-ink-2">{t('read.noLines')}</p>}
          {lines.map((l, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-t border-dashed border-line px-4 py-3 first:border-t-0">
              <span className="num w-6 shrink-0 text-xs text-ink-2">{String(i + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 text-sm font-medium leading-5">{l.description}</span>
              <span className="num shrink-0 text-right text-sm text-ink-2">
                {l.qty}{l.unit ? ` ${l.unit}` : ''}{l.unitPrice && kind !== 'delivery' ? ` · ${formatRM(parseRM(l.unitPrice))}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {doc && result?.status === 'ok' && result.model !== 'fixture' && demo.data && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setPicker(true)}><FlaskConical size={16} aria-hidden />{t('read.useDemo')}</Button>
      )}

      {result?.status === 'manual' && (
        <div className="mt-4 space-y-3 rounded-card bg-surface shadow-card p-4">
          <p className="font-medium">{t('review.manualNote')}</p>
          <Button block onClick={() => nav(`/review/${kind}/new?doc=${id}`, { replace: true })}><PenLine size={18} aria-hidden />{t('read.manual')}</Button>
          {demo.data && <Button variant="secondary" block onClick={() => setPicker(true)}><FlaskConical size={18} aria-hidden />{t('read.useDemo')}</Button>}
        </div>
      )}

      <AnimatePresence>
        {doc && ready && (
          <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
            <FixedBar><Button block onClick={goReview}>{t('read.review')}</Button></FixedBar>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={picker} onOpenChange={setPicker}>
        <SheetContent title={t('read.pickFixture')}>
          <div className="space-y-2">
            {fixtures.map(f => (
              <Button key={f.name} variant="secondary" block className="h-auto justify-start py-3 text-left" disabled={useFixture.isPending} onClick={() => { fixtureChosen.current = true; useFixture.mutate(f.name); }}>
                <span><span className="block">{f.supplierName}</span><span className="block text-xs font-normal text-ink-2">{f.docNo ?? f.name}</span></span>
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
