import { Link } from 'wouter';
import { ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/dates';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Page, EmptyState, ErrorState } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/money-input';

interface Row { id: string; name: string; owedSen: number; disputedSen: number; payNowSen: number; creditCarrySen: number; openFlags: number; nextDueAt?: number | null }

export default function Suppliers() {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['ledgers'], refetchOnMount: 'always', queryFn: () => api.get<{ suppliers: Row[] }>('/suppliers/ledgers') });
  const rows = q.data?.suppliers ?? [];
  return (
    <Page band title={t('nav.suppliers')}>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : rows.length === 0 ? <EmptyState text={t('sup.none')}><Button asChild size="sm"><Link href="/scan"><ScanLine size={18} aria-hidden />{t('sup.scanCta')}</Link></Button></EmptyState>
        : <div className="overflow-hidden rounded-card bg-surface shadow-card">{rows.map(s => (
          <Link key={s.id} href={`/suppliers/${s.id}`} className="flex min-h-[72px] items-center gap-3 border-t border-dashed border-line p-4 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{s.name}</p>
              {s.disputedSen > 0 && <p className="mt-0.5 text-xs text-dispute">{t('sup.disputeCaption', { rm: formatMoney(s.disputedSen, 'MYR') })}</p>}
              <p className="mt-0.5 text-xs text-ink-2">{[s.openFlags > 0 ? t('sup.openFlags', { n: s.openFlags }) : '', s.nextDueAt ? t('sup.nextDue', { date: fmtDate(s.nextDueAt, lang) }) : ''].filter(Boolean).join(' · ') || '\u00a0'}</p>
              {s.creditCarrySen > 0 && <p className="mt-1 text-sm text-ok">{t('supplier.credit', { rm: formatMoney(s.creditCarrySen, 'MYR') })}</p>}
            </div>
            <div className="text-right"><p className="text-xs text-ink-2">{t('sup.payNowShort')}</p><Money sen={s.payNowSen} className="text-xl font-semibold" /></div>
            <ChevronRight size={18} className="text-ink-2" aria-hidden />
          </Link>))}</div>}
    </Page>
  );
}
