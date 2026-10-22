import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Page, EmptyState } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/money-input';

interface Row { id: string; name: string; owedSen: number; disputedSen: number; payNowSen: number; creditCarrySen: number; openFlags: number }

export default function Suppliers() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['ledgers'], refetchOnMount: 'always', queryFn: () => api.get<{ suppliers: Row[] }>('/suppliers/ledgers') });
  const rows = q.data?.suppliers ?? [];
  return (
    <Page title={t('nav.suppliers')}>
      {q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : rows.length === 0 ? <EmptyState icon={<Users size={26} strokeWidth={1.5} />} text={t('sup.none')} />
        : <div className="space-y-3">{rows.map(s => (
          <Link key={s.id} href={`/suppliers/${s.id}`} className="block">
            <Card className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="mt-0.5 text-xs text-ink-2">{s.openFlags > 0 ? t('sup.openFlags', { n: s.openFlags }) : '\u00a0'}</p>
                {s.creditCarrySen > 0 && <p className="mt-1 text-sm text-ok">{t('supplier.credit', { rm: formatMoney(s.creditCarrySen, 'MYR') })}</p>}
              </div>
              <div className="text-right"><p className="text-xs text-ink-2">{t('sup.owed')}</p><Money sen={s.owedSen} className="text-xl font-semibold" /></div>
              <ChevronRight size={18} className="text-ink-2" aria-hidden />
            </Card>
          </Link>))}</div>}
    </Page>
  );
}
