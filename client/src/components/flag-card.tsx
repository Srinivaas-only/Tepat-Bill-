import { Link } from 'wouter';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { Money } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';

export interface FlagView {
  id: string; type: 'short_qty' | 'price_change' | 'not_ordered'; status: string; amountSen: number; lineDescription: string; missingQty: number | null;
  direction: string | null; supplierId: string; invoiceId: string; poId: string | null; poNo: string | null; reminderDue: boolean; supplierName: string; invoiceNo: string;
  createdAt: number; sentAt: number | null; openedAt: number | null; settledAt: number | null; request: string | null; settlement: string | null;
  needsRecheck?: boolean; parentFlagId?: string | null; childFlagId?: string | null; acceptedSen?: number | null; settlementRef?: string | null; baselineSource?: string | null; baselineUnitSen?: number | null; note?: string | null; stage?: 'invoice' | 'delivery'; deliveryId?: string | null; supersededBy?: string | null;
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
        <p className="eyebrow">{t(word[flag.type])}{flag.reminderDue && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-dispute align-middle" role="img" aria-label={t('flag.remind')} />}<span className="num ml-2 normal-case tracking-normal text-ink-3">{age(flag.openedAt ?? flag.createdAt)}</span></p>
        <p className="line-clamp-2 text-balance font-medium leading-5">{title(flag)} · {flag.lineDescription}</p>
        <p className="mt-1 flex items-center gap-1 text-caption text-ink-2"><span className="min-w-0 truncate">{flag.supplierName}</span><span aria-hidden>·</span><span className="num shrink-0">{flag.invoiceNo}</span></p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Money sen={flag.amountSen} className="text-lg font-semibold" />
        {flag.stage === 'delivery' && <span className="num text-[11px] text-ink-2">{t('flag.estimate', { rm: '' }).trim()}</span>}
        {flag.supersededBy ? <Badge tone="neutral">{t('flag.broughtToInvoice')}</Badge> : <Badge tone={statusTone[flag.status as keyof typeof statusTone]}>{t(`status.${flag.status}` as Key)}</Badge>}
      </div>
    </div>
  );
}

/** A group of flags in one bordered container, rows split by 1px hairlines. */
export function FlagLedger({ flags, onPick, dark }: { flags: FlagView[]; onPick?: (f: FlagView) => void; dark?: boolean }) {
  const row = `press block border-t first:border-t-0 ${dark ? 'border-white/10' : 'border-line'}`;
  return (
    <div className={dark ? 'stagger frosted spot overflow-hidden' : 'stagger spot overflow-hidden rounded-card bg-surface shadow-card'}>
      {flags.map(f => (onPick
        ? <button key={f.id} type="button" onClick={() => onPick(f)} className={`${row} w-full text-left`}><FlagCard flag={f} /></button>
        : <Link key={f.id} href={`/flags/${f.id}`} className={row}><FlagCard flag={f} /></Link>))}
    </div>
  );
}
