import { Link, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { can } from '@shared/core';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { formatMoney } from '@/lib/money-input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';

interface InvRow {
  id: string; invoiceNo: string; totalSen: number; issuedAt: number; dueAt: number; payment: 'paid' | 'on_credit'; state: 'recorded' | 'has_flags' | 'correct'; canMarkCorrect: boolean;
  ledger: { reductionSen: number; creditAppliedSen: number; netOwedSen: number } | null;
}
interface Data {
  supplier: { id: string; name: string; policyNote: string | null };
  ledger: { owedSen: number; disputedSen: number; payNowSen: number; creditCarrySen: number };
  invoices: InvRow[];
}
const tone = { recorded: 'neutral', has_flags: 'price', correct: 'ok' } as const;

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const { role } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ledger', id], refetchOnMount: 'always', queryFn: () => api.get<Data>(`/suppliers/${id}/ledger`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['ledger', id] }); void qc.invalidateQueries({ queryKey: ['ledgers'] }); void qc.invalidateQueries({ queryKey: ['invoices'] }); };
  const act = useMutation({
    mutationFn: (a: { invId: string; kind: 'pay' | 'unpay' | 'correct' }) => a.kind === 'correct'
      ? api.post(`/invoices/${a.invId}/mark-correct`, {})
      : api.patch(`/invoices/${a.invId}/payment`, { payment: a.kind === 'pay' ? 'paid' : 'on_credit' }),
    onSuccess: refresh, onError: () => toast.error(t('common.error')),
  });
  const d = q.data;
  const owner = !!role && can(role, 'mark_paid');
  const date = (n: number) => new Date(n).toLocaleDateString('en-GB');
  return (
    <main className="px-5 pb-10 pt-4">
      <Link href="/suppliers" className="-ml-3 mb-2 inline-flex h-11 items-center gap-2 px-3 text-sm font-semibold"><ArrowLeft size={18} aria-hidden />{t('common.back')}</Link>
      {!d ? <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-32 w-full" /></div> : (
        <div className="space-y-5">
          <h1 className="text-2xl font-semibold">{d.supplier.name}</h1>
          <Card className="p-5">
            <p className="text-sm text-ink-2">{t('supplier.payNow')}</p>
            <Money sen={d.ledger.payNowSen} animate className="text-[40px] font-bold leading-[44px]" />
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
              <div><p className="text-xs text-ink-2">{t('supplier.disputed')}</p><Money sen={d.ledger.disputedSen} animate className="font-semibold" /></div>
              <div><p className="text-xs text-ink-2">{t('supplier.creditLabel')}</p><Money sen={d.ledger.creditCarrySen} animate className="font-semibold" /></div>
              <div><p className="text-xs text-ink-2">{t('supplier.statement')}</p><Money sen={d.ledger.owedSen} animate className="font-semibold" /></div>
            </div>
            {d.ledger.creditCarrySen > 0 && <p className="mt-2 text-sm font-medium text-ok">{t('supplier.credit', { rm: formatMoney(d.ledger.creditCarrySen, 'MYR') })}</p>}
            <p className="mt-2 text-xs text-ink-2">{t('sup.statementHelp')}</p>
          </Card>
          <section>
            <h2 className="mb-2 text-lg font-semibold">{t('sup.invoices')}</h2>
            {d.invoices.length === 0 ? <p className="text-ink-2">{t('sup.noInvoices')}</p> : (
              <div className="space-y-3">{d.invoices.map(i => (
                <Card key={i.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="tnum font-semibold">{i.invoiceNo}</p><p className="text-xs text-ink-2">{date(i.issuedAt)} · {t('sup.due', { date: date(i.dueAt) })}</p></div>
                    <div className="text-right"><Money sen={i.totalSen} className="font-semibold" /><div className="mt-1 flex justify-end gap-1"><Badge tone={tone[i.state]}>{t(`sup.state.${i.state}` as Key)}</Badge><Badge tone={i.payment === 'paid' ? 'ok' : 'neutral'}>{t(i.payment === 'paid' ? 'sup.paid' : 'sup.onCredit')}</Badge></div></div>
                  </div>
                  {i.payment === 'on_credit' && i.ledger && (i.ledger.reductionSen > 0 || i.ledger.creditAppliedSen > 0) && (
                    <p className="tnum text-sm text-ink-2">
                      {i.ledger.reductionSen > 0 && <>{t('sup.reduced', { rm: formatMoney(i.ledger.reductionSen, 'MYR') })} · </>}
                      {i.ledger.creditAppliedSen > 0 && <>{t('sup.creditApplied', { rm: formatMoney(i.ledger.creditAppliedSen, 'MYR') })} · </>}
                      {t('sup.net')} <b className="text-ink">{formatMoney(i.ledger.netOwedSen, 'MYR')}</b>
                    </p>)}
                  {owner && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ invId: i.id, kind: i.payment === 'paid' ? 'unpay' : 'pay' })}>{t(i.payment === 'paid' ? 'sup.markUnpaid' : 'sup.markPaid')}</Button>
                      {i.state !== 'correct' && i.canMarkCorrect && <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ invId: i.id, kind: 'correct' })}>{t('sup.markCorrect')}</Button>}
                    </div>)}
                </Card>))}</div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
