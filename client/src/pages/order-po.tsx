import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { BackButton, ErrorState } from '@/components/page';

interface PoDetail { po: { id: string; poNo: string; supplierName: string; orderedAt: number }; lines: { id: string; description: string; orderedQty: number; unit: string | null; unitPriceSen: number | null }[] }

export default function OrderPo() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['po', id], queryFn: () => api.get<PoDetail>(`/pos/${id}`) });
  const d = q.data;
  return (
    <main className="px-5 pb-12 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/orders" />
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} notFound={q.error instanceof ApiError && q.error.status === 404} /> : !d ? <Skeleton className="h-48 w-full" /> : (
        <>
          <h1 className="num text-[28px] font-semibold leading-[34px]">{d.po.poNo}</h1>
          <p className="mb-5 mt-1 text-ink-2">{d.po.supplierName} · <span className="num">{new Date(d.po.orderedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}</span></p>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <p className="border-b border-dashed border-line px-4 py-2 text-[11px] font-medium uppercase tracking-[.1em] text-ink-2">{t('ledger.head.price')}</p>
            {d.lines.map((l, i) => (
              <div key={l.id} className="flex items-center gap-3 border-t border-dashed border-line px-4 py-3 first:border-t-0">
                <span className="num w-6 shrink-0 text-xs text-ink-2">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1 text-sm font-medium leading-5">{l.description}</span>
                <span className="num shrink-0 text-right text-sm text-ink-2">{l.orderedQty}{l.unit ? ` ${l.unit}` : ''}{l.unitPriceSen !== null && <> · <Money sen={l.unitPriceSen} /></>}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
