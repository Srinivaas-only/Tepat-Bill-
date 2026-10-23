import { Link, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import type { SelfBilledDraft } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { formatMoney } from '@/lib/money-input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-4 py-2"><dt className="text-ink-2">{k}</dt><dd className="num text-right font-semibold">{v}</dd></div>;

export default function EInvoice() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['einvoice', id], queryFn: () => api.get<{ draft: SelfBilledDraft | null }>(`/invoices/${id}/einvoice`) });
  const act = useMutation({
    mutationFn: (p: 'approve' | 'release') => api.post<{ draft: SelfBilledDraft }>(`/invoices/${id}/einvoice/${p}`, {}),
    onSuccess: r => qc.setQueryData(['einvoice', id], r), onError: () => toast.error(t('common.error')),
  });
  const d = q.data?.draft;
  const f = d?.fields;
  return (
    <main className="px-5 pb-10 pt-4">
      <Link href={`/invoices/${id}`} className="-ml-3 mb-2 inline-flex h-11 items-center gap-2 px-3 text-sm font-semibold"><ArrowLeft size={18} aria-hidden />{t('common.back')}</Link>
      {!d || !f ? <Skeleton className="h-80 w-full" /> : (
        <Card className="relative overflow-hidden p-5">
          <div className="-mx-5 -mt-5 mb-4 bg-notord px-5 py-2 text-center text-sm font-semibold text-white">{t('einv.ribbon')}</div>
          <p className="text-sm text-ink-2">{t(`einv.status.${d.status}` as Key)}</p>
          <dl className="divide-y divide-line text-sm">
            <Row k={t('einv.type')} v={t('einv.typeVal')} />
            <Row k={t('einv.no')} v={f.eInvoiceNo} />
            <Row k={t('einv.supplier')} v={f.supplierName} />
            <Row k={t('einv.tin')} v={f.supplierTin} />
            {f.supplierCountry && <Row k={t('einv.country')} v={f.supplierCountry} />}
            <Row k={t('einv.buyer')} v={f.buyer.name} />
            <Row k={t('einv.buyerTin')} v={`${f.buyer.tin} / ${f.buyer.brn}`} />
            {f.exchangeRateToMYR && <Row k={t('einv.rate')} v={f.exchangeRateToMYR.toFixed(2)} />}
          </dl>
          <h2 className="mb-1 mt-4 font-semibold">{t('einv.items')}</h2>
          <div className="divide-y divide-line text-sm">{f.lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 py-2"><span>{l.description}<span className="num block text-xs text-ink-2">{l.qty} × {formatMoney(l.unitPriceSen, f.currency)}</span></span><span className="num font-semibold">{formatMoney(l.totalSen, f.currency)}</span></div>))}</div>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3"><span className="font-semibold">{t('einv.total', { cur: f.currency })}</span><span className="num text-2xl font-semibold">{formatMoney(f.totalSen, f.currency)}</span></div>
          <div className="mt-5 space-y-2">
            {d.status === 'draft' && <Button block disabled={act.isPending} onClick={() => act.mutate('approve')}>{t('einv.approve')}</Button>}
            {d.status === 'approved' && <Button block disabled={act.isPending} onClick={() => act.mutate('release')}>{t('einv.release')}</Button>}
            {d.status === 'released_stub' && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-ink-2">{t('einv.releasedNote')}</p>}
          </div>
        </Card>
      )}
    </main>
  );
}
