import { useParams, useLocation, Link } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { can, formatRM } from '@shared/core';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Money } from '@/components/ui/money';
import { BackButton, ErrorState } from '@/components/page';
import { Stamp } from '@/components/stamp';
import { FlagLedger, type FlagView } from '@/components/flag-card';

interface Row { lineId: string; description: string; orderedQty: number | null; receivedQty: number | null; billedQty: number; unitPriceSen: number | null; refUnitSen: number | null; flagTypes: string[] }
interface Cmp {
  invoice: { id: string; invoiceNo: string; supplierName: string; totalSen: number; payment: string; docDate: string | null; poNo: string | null };
  delivery: { id: string; doNo: string; docDate: string | null } | null;
  rows: Row[]; flags: FlagView[]; flagCount: number; claimableSen: number; readyToPay: boolean; netOwedSen: number;
}
const dmy = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

export default function Compare() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { role } = useAuth();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['compare', id], queryFn: () => api.get<Cmp>(`/invoices/${id}/compare`), refetchOnMount: 'always' });
  const pay = useMutation({
    mutationFn: () => api.patch(`/invoices/${id}/payment`, { payment: 'paid' }),
    onSuccess: () => { for (const k of ['compare', 'invoice', 'invoices', 'ledger', 'ledgers', 'home']) void qc.invalidateQueries({ queryKey: [k] }); toast.success(t('act.invoice.mark_paid')); nav('/', { replace: true }); },
    onError: e => toast.error(e instanceof ApiError && e.code === 'no_change' ? t('flag.alreadyDone') : t('common.error')),
  });
  const d = q.data;
  const cell = (bad: boolean) => (bad ? 'font-semibold text-short' : '');

  return (
    <main className="px-5 pb-12 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/orders" />
      <div className="on-dark mb-4 rounded-[20px] px-4 py-3 text-white shadow-[0_14px_32px_-16px_rgba(19,37,74,.6)]" style={{ background: 'var(--grad-band)' }}>
        <p className="text-[11px] font-medium uppercase tracking-[.14em] text-white/70">{t('compare.title')}</p>
        {d && <p className="mt-1 font-medium"><span className="num">{d.invoice.invoiceNo}</span> · {d.invoice.supplierName}{d.delivery && <> · <span className="num">{d.delivery.doNo}</span></>}</p>}
      </div>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} notFound={q.error instanceof ApiError && q.error.status === 404} /> : !d ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-5">
          {d.readyToPay ? (
            <section className="space-y-3 text-center">
              <Stamp status="ok" thunk label={t('compare.correct')} />
              <p className="text-ink-2">{t('compare.ready')}</p>
              <p><span className="inline-block border-b-[3px] border-double border-ink pb-1"><Money sen={d.netOwedSen} animate className="text-[32px] font-semibold leading-10" /></span></p>
              {d.invoice.payment !== 'paid' && role && can(role, 'mark_paid') && <Button block disabled={pay.isPending} onClick={() => pay.mutate()}>{t('compare.markPaid')}</Button>}
            </section>
          ) : (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold leading-6">{t('compare.diffs', { n: d.flagCount, rm: formatRM(d.claimableSen) })}</h2>
              <FlagLedger flags={d.flags.filter(f => f.status !== 'dismissed')} />
              <Button block asChild><Link href="/flags">{t('compare.viewFlags')}</Link></Button>
            </section>
          )}
          <div className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-dashed border-line px-4 py-2 text-[11px] font-medium uppercase tracking-[.08em] text-ink-2">
              <span>{t('ledger.head.qty').split(' · ')[0]}</span><span className="w-10 text-right" title={t('compare.ordered')} aria-label={t('compare.ordered')}>{t('compare.colPo')}</span><span className="w-10 text-right" title={t('compare.received')} aria-label={t('compare.received')}>{t('compare.colDo')}</span><span className="w-10 text-right" title={t('compare.billed')} aria-label={t('compare.billed')}>{t('compare.colInv')}</span>
            </div>
            {d.rows.map((r, i) => {
              const short = r.flagTypes.includes('short_qty'); const price = r.flagTypes.includes('price_change'); const notOrd = r.flagTypes.includes('not_ordered');
              return (
                <div key={r.lineId} className="border-t border-dashed border-line px-4 py-3 first:border-t-0">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] items-start gap-x-3">
                    <p className="flex gap-2 text-sm font-medium leading-5"><span className="num w-5 shrink-0 text-xs leading-5 text-ink-2">{String(i + 1).padStart(2, '0')}</span><span>{r.description}</span></p>
                    <span className={`num w-10 text-right text-sm ${cell(notOrd)}`}>{r.orderedQty ?? '–'}</span>
                    <span className={`num w-10 text-right text-sm ${cell(short)}`}>{r.receivedQty ?? '–'}</span>
                    <span className={`num w-10 text-right text-sm ${cell(short || notOrd)}`}>{r.billedQty}</span>
                  </div>
                  {r.unitPriceSen !== null && (
                    <p className="num mt-1 pl-7 text-xs text-ink-2"><span className={cell(price)}><Money sen={r.unitPriceSen} /></span>{r.refUnitSen !== null && <> · {t('compare.refPrice', { rm: formatRM(r.refUnitSen).replace(/^RM/, '') })}</>}</p>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}
    </main>
  );
}
