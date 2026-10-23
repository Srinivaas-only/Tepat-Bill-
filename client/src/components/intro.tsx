import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { closeIntro } from '@/lib/intro';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';

const TOTAL = 4;
const spring = { type: 'spring', stiffness: 380, damping: 30 } as const;

/** 1. A document with a scan beam, then one line gets boxed (what the AI "reads"). */
function Scan() {
  const rows = [0.62, 0.9, 0.74, 0.86, 0.5, 0.8];
  return (
    <div className="relative h-[264px] w-[200px] overflow-hidden rounded-card bg-[#F5F3EC] p-4 shadow-[0_0_0_1px_rgb(255_255_255/.15),0_24px_48px_-16px_rgb(36_87_214/.55)]">
      <div className="mb-3 h-3 w-24 rounded bg-[#13254A]/80" />
      {rows.map((w, i) => (
        <div key={i} className="relative mb-3 h-2.5 rounded bg-[#13254A]/15" style={{ width: `${w * 100}%` }}>
          {i === 3 && <motion.span aria-hidden className="absolute -inset-x-1.5 -inset-y-1 rounded-md border-2 border-brand bg-brand/15" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.1, ...spring }} />}
        </div>
      ))}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full" style={{ animation: 'tb-sweep 2.2s ease-in-out infinite' }}>
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-brand/30" />
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-brand shadow-[0_0_14px_2px_rgb(147_180_255/.8)]" />
      </div>
      {['left-2 top-2 border-l-2 border-t-2 rounded-tl-lg', 'right-2 top-2 border-r-2 border-t-2 rounded-tr-lg', 'left-2 bottom-2 border-l-2 border-b-2 rounded-bl-lg', 'right-2 bottom-2 border-r-2 border-b-2 rounded-br-lg'].map(c => <span key={c} aria-hidden className={`absolute h-5 w-5 border-brand ${c}`} />)}
    </div>
  );
}

/** 2. Invoice says 48, you count 42: the gap pops out. */
function Count() {
  const { t } = useI18n();
  const [got, setGot] = useState(48);
  const [short, setShort] = useState(false);
  useEffect(() => {
    const ids: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 6; i++) ids.push(setTimeout(() => setGot(48 - i), 700 + i * 140));
    ids.push(setTimeout(() => setShort(true), 700 + 6 * 140 + 200));
    return () => ids.forEach(clearTimeout);
  }, []);
  return (
    <div className="w-[280px] rounded-card bg-surface p-4 shadow-raised">
      <p className="eyebrow mb-2">SARDIN AYAM BRAND 425G</p>
      <div className="flex items-center justify-between border-b border-line py-3"><span className="text-ink-2">{t('intro.demo.invoice')}</span><span className="num text-lg font-semibold">48</span></div>
      <div className="flex items-center justify-between py-3"><span className="text-ink-2">{t('intro.demo.got')}</span>
        <span className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-white/[.08] text-lg text-ink-2 ring-1 ring-white/10">−</span>
          <motion.span key={got} initial={{ y: -6, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.12 }} className="num w-9 text-center text-2xl font-semibold">{got}</motion.span>
          <span className="flex h-9 w-9 items-center justify-center rounded-btn bg-white/[.08] text-lg text-ink-2 ring-1 ring-white/10">+</span>
        </span>
      </div>
      <div className="h-9">
        <AnimatePresence>{short && <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }} className="inline-block"><Badge tone="short">{t('flag.typeShort')} · 6</Badge></motion.div>}</AnimatePresence>
      </div>
    </div>
  );
}

/** 3. The difference lands as a flag with an exact RM amount. */
function Flag() {
  const { t } = useI18n();
  const [amt, setAmt] = useState(0);
  useEffect(() => { const id = setTimeout(() => setAmt(4140), 650); return () => clearTimeout(id); }, []);
  return (
    <motion.div initial={{ y: 40, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={spring} className="relative w-[292px] overflow-hidden rounded-card bg-surface shadow-raised">
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-short" />
      <div className="flex items-center gap-3 py-4 pl-5 pr-4">
        <div className="min-w-0 flex-1"><p className="eyebrow">{t('flag.typeShort')}</p><p className="font-medium leading-5">Sardin Ayam Brand 425g</p><p className="mt-1 text-caption text-ink-2">Lim Brothers · LB-7781</p></div>
        <div className="flex flex-col items-end gap-1"><Money sen={amt} animate className="text-lg font-semibold" /><Badge tone="brand">{t('status.open')}</Badge></div>
      </div>
    </motion.div>
  );
}

/** 4. A message goes out with an evidence link; the flag ends settled. */
function Send() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  useEffect(() => { const id = setTimeout(() => setDone(true), 1500); return () => clearTimeout(id); }, []);
  return (
    <div className="flex w-[292px] flex-col items-end gap-4">
      <motion.div initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={spring} className="w-full rounded-card rounded-br-md bg-[#0B3B2C] p-4 shadow-raised ring-1 ring-white/10">
        <div className="space-y-2"><div className="h-2.5 w-11/12 rounded bg-white/25" /><div className="h-2.5 w-8/12 rounded bg-white/25" /></div>
        <div className="mt-3 flex items-center justify-between rounded-btn bg-black/25 px-3 py-2 text-sm"><span className="num text-brand-text">…/e/xk3f9a</span><ExternalLink size={16} className="text-brand-text" aria-hidden /></div>
        <p className="num mt-3 text-right text-[11px] text-white/60">✓✓</p>
      </motion.div>
      <div className="flex h-10 w-full items-center justify-center">
        <AnimatePresence>{done && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 20 }} className="flex items-center gap-2 rounded-full bg-ok-bg px-4 py-2 text-ok ring-1 ring-ok/30">
            <Check size={18} aria-hidden /><span className="font-semibold">{t('status.settled')}</span>
          </motion.div>)}</AnimatePresence>
      </div>
    </div>
  );
}

const stages = [Scan, Count, Flag, Send];

export default function Intro() {
  const { t, lang, setLang } = useI18n();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const next = useRef<HTMLButtonElement>(null);
  const last = step === TOTAL - 1;
  const go = () => { if (last) closeIntro(); else { setDir(1); setStep(s => s + 1); } };
  useEffect(() => { next.current?.focus(); }, [step]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') closeIntro(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  const Stage = stages[step];
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={t('intro.guide')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[80] flex flex-col bg-bg">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(70% 45% at 50% 30%, rgb(36 87 214 / .30), transparent 70%)' }} />
      <div className="relative mx-auto flex h-full w-full max-w-[480px] flex-col px-5 pb-[calc(24px+var(--safe-bottom))] pt-[calc(16px+var(--safe-top))]">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step + 1} aria-label={t('intro.step', { n: step + 1, total: TOTAL })}>
            {Array.from({ length: TOTAL }, (_, i) => (
              <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                <motion.span className="block h-full rounded-full bg-ink" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} />
              </span>))}
          </div>
          <button type="button" onClick={() => setLang(lang === 'ms' ? 'en' : 'ms')} className="press min-h-11 rounded-full px-3 text-sm font-semibold text-ink-2">{lang === 'ms' ? 'EN' : 'BM'}</button>
          <button type="button" onClick={closeIntro} className="press min-h-11 rounded-full bg-white/[.08] px-4 text-sm font-semibold text-ink ring-1 ring-white/15 [@media(hover:hover)]:hover:bg-white/[.14]">{t('intro.skip')}</button>
        </div>
        <div className="relative flex flex-1 items-center justify-center">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div key={step} custom={dir} initial={{ opacity: 0, x: 28 * dir, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -28 * dir, scale: 0.96 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
              <Stage />
            </motion.div>
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="min-h-[148px]">
            <h2 className="text-title font-semibold tracking-[-0.02em]">{t(`intro.${step + 1}.title` as Key)}</h2>
            <p className="mt-2 text-ink-2">{t(`intro.${step + 1}.body` as Key)}</p>
          </motion.div>
        </AnimatePresence>
        <Button ref={next} block onClick={go} className="mt-4">{last ? t('intro.start') : t('intro.next')}<ArrowRight size={20} aria-hidden /></Button>
      </div>
    </motion.div>
  );
}
