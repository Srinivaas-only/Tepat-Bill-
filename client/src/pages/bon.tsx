import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { toast } from 'sonner';
import { formatRM } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Page, EmptyState, ErrorState } from '@/components/page';
import { fmtDate } from '@/lib/dates';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface InvRow { id: string; invoiceNo: string; supplierName: string; totalSen: number; issuedAt: number }

export default function Bon() {
  const { docId } = useParams<{ docId: string }>();
  const { t, lang } = useI18n();
  const [, nav] = useLocation();
  const q = useQuery({ queryKey: ['invoices'], queryFn: () => api.get<{ invoices: InvRow[] }>('/invoices') });
  const attach = useMutation({
    mutationFn: (invoiceId: string) => api.post(`/documents/${docId}/attach`, { invoiceId, photoKind: 'signed_bon' }),
    onSuccess: (_r, invoiceId) => nav(`/invoices/${invoiceId}/count`, { replace: true }),
    onError: () => toast.error(t('common.error')),
  });
  const list = q.data?.invoices ?? [];
  return (
    <Page title={t('bon.title')} back="/scan">
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px] w-full" />)}</div>
        : list.length === 0 ? <EmptyState text={t('bon.none')}><Button asChild size="sm"><Link href="/scan">{t('nav.scan')}</Link></Button></EmptyState>
        : <div className="overflow-hidden rounded-card border border-line bg-surface">{list.slice(0, 12).map(v => (
          <button key={v.id} type="button" disabled={attach.isPending} onClick={() => attach.mutate(v.id)} className="flex min-h-[72px] w-full items-center justify-between border-t border-dashed border-line p-4 text-left first:border-t-0">
            <div><p className="num font-semibold">{v.invoiceNo}</p><p className="text-sm text-ink-2">{v.supplierName} · {fmtDate(v.issuedAt, lang)}</p></div>
            <p className="num font-semibold">{formatRM(v.totalSen)}</p>
          </button>))}</div>}
    </Page>
  );
}
