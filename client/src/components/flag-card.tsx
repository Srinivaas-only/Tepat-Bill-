import { motion } from 'motion/react';
import { PackageMinus, Tag, PackageX } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { Money } from '@/components/ui/money';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface FlagView {
  id: string; type: 'short_qty' | 'price_change' | 'not_ordered'; status: string; amountSen: number; lineDescription: string; missingQty: number | null;
  direction: string | null; supplierId: string; invoiceId: string; poId: string | null; poNo: string | null; reminderDue: boolean; supplierName: string; invoiceNo: string;
  createdAt: number; sentAt: number | null; openedAt: number | null; settledAt: number | null; request: string | null; settlement: string | null;
}
const icon = { short_qty: PackageMinus, price_change: Tag, not_ordered: PackageX } as const;
const bg = { short_qty: 'bg-short-bg text-short', price_change: 'bg-price-bg text-price', not_ordered: 'bg-notord-bg text-notord' } as const;
export const statusTone = { proposed: 'neutral', open: 'brand', disputed: 'dispute', settled: 'ok', dismissed: 'neutral' } as const;

export function useFlagTitle() {
  const { t } = useI18n();
  return (f: FlagView) => f.type === 'short_qty' ? t('flag.short', { n: f.missingQty ?? 0 }) : f.type === 'price_change' ? t('flag.price') : t('flag.notOrdered');
}

export function useAge() {
  const { t } = useI18n();
  return (ms: number) => { const d = Math.floor((Date.now() - ms) / 86_400_000); return d <= 0 ? t('age.today') : t('age.days', { n: d }); };
}

export function FlagCard({ flag, index = 0 }: { flag: FlagView; index?: number }) {
  const title = useFlagTitle();
  const age = useAge();
  const { t } = useI18n();
  const Icon = icon[flag.type];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32, delay: Math.min(index, 10) * 0.04 }} whileTap={{ scale: 0.98 }}>
      <Card className="flex min-h-[72px] items-center gap-3 p-4">
        <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${bg[flag.type]}`}>
          <Icon size={20} strokeWidth={1.5} aria-hidden />
          {flag.reminderDue && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-dispute ring-2 ring-surface" role="img" aria-label={t('flag.remind')} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium leading-5">{title(flag)} · {flag.lineDescription}</p>
          <p className="mt-0.5 truncate text-xs text-ink-2">{flag.supplierName} · <span className="tnum">{flag.invoiceNo}</span> · <span className="tnum">{age(flag.openedAt ?? flag.createdAt)}</span></p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <motion.span layoutId={`flag-amt-${flag.id}`}><Money sen={flag.amountSen} className="text-xl font-semibold" /></motion.span>
          <motion.span layoutId={`flag-chip-${flag.id}`}><Badge tone={statusTone[flag.status as keyof typeof statusTone]}>{t(`status.${flag.status}` as Key)}</Badge></motion.span>
        </div>
      </Card>
    </motion.div>
  );
}
