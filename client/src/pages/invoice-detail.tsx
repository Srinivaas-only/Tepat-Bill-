import { Link, useLocation, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { can } from '@shared/core';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/lib/money-input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { DocImage } from '@/components/doc-image';
import { FlagLedger, type FlagView } from '@/components/flag-card';
import { BackButton, SectionLabel, ErrorState } from '@/components/page';

interface Detail {
  invoice: { id: string; invoiceNo: string; supplierId: string; supplierName: string; poNo: string | null; currency: string; totalSen: number; payment: string; state?: string; canMarkCorrect?: boolean; hasDraft?: boolean; compared?: boolean; documentId: string | null; doc: { width: number; height: number } | null };
  lines: { lineId: string; description: string; qty: number; unitPriceSen: number; lineTotalSen: number; box: [number, number, number, number] | null }[];
  counts: Record<string, number>; hasCounts: boolean; flags: FlagView[];
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { role } = useAuth();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['invoice', id], refetchOnMount: 'always', queryFn: () => api.get<Detail>(`/invoices/${id}`) });
  const foreign = useQuery({ queryKey: ['supplier-foreign', q.data?.invoice.supplierId], enabled: !!q.data && !!role && can(role, 'approve_einvoice'),
    queryFn: async () => (await api.get<{ suppliers: { id: string; isForeign: boolean }[] }>('/suppliers')).suppliers.find(s => s.id === q.data!.invoice.supplierId)?.isForeign ?? false });
  const prep = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/einvoice`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['einvoice', id] }); nav(`/invoices/${id}/einvoice`); },
    onError: () => toast.error(t('common.error')),
  });
  const invalidate = () => Promise.all(['invoice', 'invoices', 'ledger', 'ledgers', 'home', 'flags'].map(k => qc.invalidateQueries({ queryKey: [k] })));
  const pay = useMutation({
    mutationFn: (payment: 'paid' | 'on_credit') => api.patch(`/invoices/${id}/payment`, { payment }),
    onSuccess: () => invalidate(), onError: () => toast.error(t('common.error')),
  });
  const mark = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/mark-correct`, {}),
    onSuccess: () => invalidate(), onError: () => toast.error(t('common.error')),
  });
  const d = q.data;
  const owner = !!role && can(role, 'mark_paid');
  return (
    <main className="px-5 pb-10 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/orders" />
      {q.isError ? <ErrorState notFound onRetry={() => void q.refetch()} /> : !d ? <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40 w-full" /></div> : (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-ink-2">{t('inv.title')}{d.invoice.poNo ? ` · ${d.invoice.poNo}` : ''}</p>
            <h1 className="num text-2xl font-semibold leading-8 tracking-[-0.02em]">{d.invoice.invoiceNo}</h1>
            <Link href={`/suppliers/${d.invoice.supplierId}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-text">{d.invoice.supplierName}</Link>
          </div>
          <div className="space-y-2">
            {d.invoice.compared
              ? <Button block onClick={() => nav(`/invoices/${id}/compare`)}>{t('inv.compare')}</Button>
              : <Button block variant={d.hasCounts ? 'secondary' : 'primary'} onClick={() => nav(`/invoices/${id}/count`)}>{t(d.hasCounts ? 'inv.recount' : 'inv.counts')}</Button>}
            <div className="grid grid-cols-2 gap-2 empty:hidden">
              {owner && <Button size="sm" variant="secondary" className="col-span-2 sm:col-span-1" disabled={pay.isPending} onClick={() => pay.mutate(d.invoice.payment === 'paid' ? 'on_credit' : 'paid')}>{t(d.invoice.payment === 'paid' ? 'inv.markUnpaid' : 'inv.markPaid')}</Button>}
              {owner && d.invoice.canMarkCorrect && d.invoice.state !== 'correct' && <Button size="sm" variant="secondary" disabled={mark.isPending} onClick={() => mark.mutate()}>{t('sup.markCorrect')}</Button>}
              {d.invoice.hasDraft && <Button size="sm" variant="secondary" onClick={() => nav(`/invoices/${id}/einvoice`)}>{t('inv.viewEinvoice')}</Button>}
              {foreign.data && !d.invoice.hasDraft && <Button size="sm" variant="secondary" disabled={prep.isPending} onClick={() => prep.mutate()}>{t('inv.einvoice')}</Button>}
            </div>
          </div>
          {d.invoice.documentId && d.invoice.doc && <DocImage src={`/api/documents/${d.invoice.documentId}/file`} width={d.invoice.doc.width || 900} height={d.invoice.doc.height || 1180} alt={d.invoice.invoiceNo} boxes={d.lines.map(l => l.box)} maxHeight="45dvh" />}
          <section>
            <SectionLabel>{t('inv.lines')}</SectionLabel>
            <div className="overflow-hidden rounded-card bg-surface shadow-card px-4">
              <p className="py-2 eyebrow">{t('inv.lineHead')}</p>
              {d.lines.map((l, i) => (
                <div key={l.lineId} className="flex items-start justify-between gap-3 border-t border-line py-3 text-sm">
                  <span className="num pt-0.5 text-xs text-ink-2">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1"><p className="font-medium">{l.description}</p><p className="num text-xs text-ink-2">{d.counts[`line:${l.lineId}`] ?? l.qty} / {l.qty} × {formatMoney(l.unitPriceSen, 'MYR')}</p></div>
                  <p className="num shrink-0 font-semibold">{formatMoney(l.lineTotalSen, 'MYR')}</p>
                </div>))}
              <div className="flex items-baseline justify-between border-t border-line py-3"><span className="text-ink-2">{t('inv.total')}</span><span className="inline-block"><Money sen={d.invoice.totalSen} className="text-xl font-semibold" /></span></div>
            </div>
          </section>
          <section>
            <SectionLabel count={d.flags.length}>{t('inv.flags')}</SectionLabel>
            {d.flags.length === 0 ? <p className="text-ink-2">{t('inv.noFlags')}</p> : <FlagLedger flags={d.flags} />}
          </section>
        </div>
      )}
    </main>
  );
}
