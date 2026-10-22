import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import { Truck } from 'lucide-react';
import { formatRM } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Page, EmptyState } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface InvRow { id: string; invoiceNo: string; supplierName: string; totalSen: number; issuedAt: number }

export default function Bon() {
  const { docId } = useParams<{ docId: string }>();
  const { t } = useI18n();
  const [, nav] = useLocation();
  const q = useQuery({ queryKey: ['invoices'], queryFn: () => api.get<{ invoices: InvRow[] }>('/invoices') });
  const attach = useMutation({
    mutationFn: (invoiceId: string) => api.post(`/documents/${docId}/attach`, { invoiceId, photoKind: 'signed_bon' }),
    onSuccess: (_r, invoiceId) => nav(`/invoices/${invoiceId}/count`, { replace: true }),
    onError: () => toast.error(t('common.error')),
  });
  const list = q.data?.invoices ?? [];
  return (
    <Page title={t('bon.title')}>
      {q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px] w-full" />)}</div>
        : list.length === 0 ? <EmptyState icon={<Truck size={26} strokeWidth={1.5} />} text={t('bon.none')} />
        : <div className="space-y-3">{list.slice(0, 12).map(v => (
          <button key={v.id} type="button" disabled={attach.isPending} onClick={() => attach.mutate(v.id)} className="block w-full text-left active:scale-[0.98]">
            <Card className="flex min-h-[72px] items-center justify-between p-4">
              <div><p className="tnum font-semibold">{v.invoiceNo}</p><p className="text-sm text-ink-2">{v.supplierName} · {new Date(v.issuedAt).toLocaleDateString('en-GB')}</p></div>
              <p className="tnum font-semibold">{formatRM(v.totalSen)}</p>
            </Card></button>))}</div>}
    </Page>
  );
}
