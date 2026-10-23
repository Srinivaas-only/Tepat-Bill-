import { motion } from 'motion/react';
import { PackageMinus, TrendingUp, PackageX } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Money } from '@/components/ui/money';
import { Card } from '@/components/ui/card';

export interface FlagView {
  id: string; type: 'short_qty' | 'price_change' | 'not_ordered'; status: string; amountSen: number; lineDescription: string; missingQty: number | null;
  direction: string | null; supplierName: string; invoiceNo: string; createdAt: number; sentAt: number | null; openedAt: number | null; settledAt: number | null; request: string | null; settlement: string | null;
}
const icon = { short_qty: PackageMinus, price_change: TrendingUp, not_ordered: PackageX } as const;
const bg = { short_qty: 'bg-short-bg text-short', price_change: 'bg-price-bg text-price', not_ordered: 'bg-notord-bg text-notord' } as const;

export function useFlagTitle() {
  const { t } = useI18n();
  return (f: FlagView) => f.type === 'short_qty' ? t('flag.short', { n: f.missingQty ?? 0 }) : f.type === 'price_change' ? t('flag.price') : t('flag.notOrdered');
}

export function FlagCard({ flag, index = 0 }: { flag: FlagView; index?: number }) {
  const title = useFlagTitle();
  const Icon = icon[flag.type];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 32, delay: Math.min(index, 10) * 0.04 }} whileTap={{ scale: 0.98 }}>
      <Card className="flex min-h-[72px] items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${bg[flag.type]}`}><Icon size={20} strokeWidth={1.5} aria-hidden /></div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium leading-5">{title(flag)} · {flag.lineDescription}</p>
          <p className="mt-0.5 truncate text-xs text-ink-2">{flag.supplierName} · {flag.invoiceNo}</p>
        </div>
        <Money sen={flag.amountSen} className="shrink-0 text-xl font-semibold" />
      </Card>
    </motion.div>
  );
}
