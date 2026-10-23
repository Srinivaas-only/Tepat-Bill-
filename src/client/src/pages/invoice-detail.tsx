import { Link, useLocation, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
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
import { FlagCard, type FlagView } from '@/components/flag-card';

interface Detail {
  invoice: { id: string; invoiceNo: string; supplierId: string; supplierName: string; poNo: string | null; currency: string; totalSen: number; payment: string; documentId: string | null; doc: { width: number; height: number } | null };
  lines: { lineId: string; description: string; qty: number; unitPriceSen: number; box: [number, number, number, number] | null }[];
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
  const d = q.data;
  return (
    <main className="px-5 pb-10 pt-4">
      <Link href="/orders" className="-ml-3 mb-2 inline-flex h-11 items-center gap-2 px-3 text-sm font-semibold"><ArrowLeft size={18} aria-hidden />{t('common.back')}</Link>
      {!d ? <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40 w-full" /></div> : (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-ink-2">{t('inv.title')}{d.invoice.poNo ? ` · ${d.invoice.poNo}` : ''}</p>
            <h1 className="tnum text-2xl font-semibold">{d.invoice.invoiceNo}</h1>
            <Link href={`/suppliers/${d.invoice.supplierId}`} className="text-sm font-semibold text-brand">{d.invoice.supplierName}</Link>
          </div>
          {d.invoice.documentId && d.invoice.doc && <DocImage src={`/api/documents/${d.invoice.documentId}/file`} width={d.invoice.doc.width || 900} height={d.invoice.doc.height || 1180} alt="" boxes={d.lines.map(l => l.box)} maxHeight="45dvh" />}
          <Card className="divide-y divide-line px-4">
            {d.lines.map(l => (
              <div key={l.lineId} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0"><p className="font-medium">{l.description}</p><p className="tnum text-xs text-ink-2">{d.counts[`line:${l.lineId}`] ?? l.qty} / {l.qty} × {formatMoney(l.unitPriceSen, 'MYR')}</p></div>
                <p className="tnum shrink-0 font-semibold">{formatMoney(l.qty * l.unitPriceSen, 'MYR')}</p>
              </div>))}
            <div className="flex items-baseline justify-between py-3"><span className="text-ink-2">{t('inv.total')}</span><Money sen={d.invoice.totalSen} className="text-xl font-semibold" /></div>
          </Card>
          <Button block variant={d.hasCounts ? 'secondary' : 'primary'} onClick={() => nav(`/invoices/${id}/count`)}>{t(d.hasCounts ? 'inv.recount' : 'inv.counts')}</Button>
          {foreign.data && <Button block variant="secondary" disabled={prep.isPending} onClick={() => prep.mutate()}>{t('inv.einvoice')}</Button>}
          <section>
            <h2 className="mb-2 text-lg font-semibold">{t('inv.flags')}</h2>
            {d.flags.length === 0 ? <p className="text-ink-2">{t('inv.noFlags')}</p> : <div className="space-y-3">{d.flags.map((f, i) => <Link key={f.id} href={`/flags/${f.id}`} className="block"><FlagCard flag={f} index={i} /></Link>)}</div>}
          </section>
        </div>
      )}
    </main>
  );
}
