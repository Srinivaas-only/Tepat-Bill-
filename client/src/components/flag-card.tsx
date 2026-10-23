import { motion } from 'motion/react';
import { Link } from 'wouter';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { Money } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';

export interface FlagView {
  id: string; type: 'short_qty' | 'price_change' | 'not_ordered'; status: string; amountSen: number; lineDescription: string; missingQty: number | null;
  direction: string | null; supplierId: string; invoiceId: string; poId: string | null; poNo: string | null; reminderDue: boolean; supplierName: string; invoiceNo: string;
  createdAt: number; sentAt: number | null; openedAt: number | null; settledAt: number | null; request: string | null; settlement: string | null;
}
export const statusTone = { proposed: 'neutral', open: 'brand', disputed: 'dispute', settled: 'ok', dismissed: 'neutral' } as const;

export function useFlagTitle() {
  const { t } = useI18n();
  return (f: FlagView) => f.type === 'short_qty' ? t('flag.short', { n: f.missingQty ?? 0 }) : f.type === 'price_change' ? t('flag.price') : t('flag.notOrdered');
}

export function useAge() {
  const { t } = useI18n();
  return (ms: number) => { const d = Math.floor((Date.now() - ms) / 86_400_000); return d <= 0 ? t('age.today') : t('age.days', { n: d }); };
}

const bar = { short_qty: 'bg-short', price_change: 'bg-price', not_ordered: 'bg-notord' } as const;
const word = { short_qty: 'flag.typeShort', price_change: 'flag.typePrice', not_ordered: 'flag.typeNotOrd' } as const;

/** One ledger row: 3px bar in the type colour, small type word, one status chip. */
export function FlagCard({ flag }: { flag: FlagView; index?: number }) {
  const title = useFlagTitle();
  const age = useAge();
  const { t, lang } = useI18n();
  void lang;
  return (
    <div className="relative flex min-h-[72px] items-center gap-3 py-3 pl-5 pr-4">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${bar[flag.type]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[.08em] text-ink-2">{t(word[flag.type])}{flag.reminderDue && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-dispute align-middle" role="img" aria-label={t('flag.remind')} />}</p>
        <p className="line-clamp-2 font-medium leading-5">{title(flag)} · {flag.lineDescription}</p>
        <p className="mt-0.5 truncate text-xs text-ink-2">{flag.supplierName} · <span className="num">{flag.invoiceNo}</span> · <span className="num">{age(flag.openedAt ?? flag.createdAt)}</span></p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <motion.span layoutId={`flag-amt-${flag.id}`}><Money sen={flag.amountSen} className="text-lg font-semibold" /></motion.span>
        <motion.span layoutId={`flag-chip-${flag.id}`}><Badge tone={statusTone[flag.status as keyof typeof statusTone]}>{t(`status.${flag.status}` as Key)}</Badge></motion.span>
      </div>
    </div>
  );
}

/** A group of flags in one bordered container, rows split by dashed hairlines (like a bon). */
export function FlagLedger({ flags, onPick }: { flags: FlagView[]; onPick?: (f: FlagView) => void }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      {flags.map(f => (onPick
        ? <button key={f.id} type="button" onClick={() => onPick(f)} className="block w-full border-t border-dashed border-line text-left first:border-t-0"><FlagCard flag={f} /></button>
        : <Link key={f.id} href={`/flags/${f.id}`} className="block border-t border-dashed border-line first:border-t-0"><FlagCard flag={f} /></Link>))}
    </div>
  );
}
