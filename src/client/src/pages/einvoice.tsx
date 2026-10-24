import { useParams } from 'wouter';
import { can } from '@shared/core';
import { useAuth } from '@/lib/auth';
import { BackButton, EmptyState, ErrorState, SectionLabel } from '@/components/page';
import { Stamp } from '@/components/stamp';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SelfBilledDraft } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { formatMoney } from '@/lib/money-input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useState } from 'react';
import { Printer } from 'lucide-react';
import { ShopSheet } from '@/components/shop-sheet';
import { Skeleton } from '@/components/ui/skeleton';

const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-4 py-2"><dt className="text-ink-2">{k}</dt><dd className="num text-right font-semibold">{v}</dd></div>;

export default function EInvoice() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['einvoice', id], queryFn: () => api.get<{ draft: SelfBilledDraft | null; issues: { code: string }[] }>(`/invoices/${id}/einvoice`) });
  const act = useMutation({
    mutationFn: (p: 'approve' | 'release') => api.post<{ draft: SelfBilledDraft }>(`/invoices/${id}/einvoice/${p}`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['einvoice', id] }), onError: () => toast.error(t('common.error')),
  });
  const issues = q.data?.issues ?? [];
  const [shopOpen, setShopOpen] = useState(false);
  const { role } = useAuth();
  const d = q.data?.draft;
  const f = d?.fields;
  return (
    <main className="px-5 pb-10 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback={`/invoices/${id}`} />
      {role && !can(role, 'approve_einvoice') ? <p className="rounded-card border border-line px-4 py-3 text-ink-2">{t('owner.only')}</p>
      : q.isError ? <ErrorState onRetry={() => void q.refetch()} />
      : q.data && !d ? <EmptyState text={t('common.error')} />
      : !d || !f ? <Skeleton className="h-80 w-full" /> : (
        <Card className="relative overflow-hidden p-5">
          <div className="mb-4 flex items-start justify-between gap-3"><p className="eyebrow text-notord">{t('einv.ribbon')}</p><Stamp status="ok" label={t(`einv.status.${d.status}` as Key)} /></div>
          {issues.length > 0 && (
            <div className="mb-4 rounded-card bg-notord-bg px-4 py-3 text-sm text-notord print:hidden">
              <p className="font-semibold">{t('einv.incomplete')}</p>
              <ul className="mt-1 list-disc pl-5">{issues.map(i => <li key={i.code}>{t(`einv.issue.${i.code}` as Key)}</li>)}</ul>
              {issues.some(i => i.code.startsWith('buyer_')) && <Button size="sm" variant="secondary" className="mt-2" onClick={() => setShopOpen(true)}>{t('shop.title')}</Button>}
            </div>
          )}
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
          <div className="mt-4"><SectionLabel>{t('einv.items')}</SectionLabel></div>
          <div className="divide-y divide-line text-sm">{f.lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-3 py-2"><span>{l.description}<span className="num block text-xs text-ink-2">{l.qty} × {formatMoney(l.unitPriceSen, f.currency)}</span></span><span className="num font-semibold">{formatMoney(l.totalSen, f.currency)}</span></div>))}</div>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3"><span className="font-semibold">{t('einv.total', { cur: f.currency })}</span><span className="num text-2xl font-semibold">{formatMoney(f.totalSen, f.currency)}</span></div>
          <div className="mt-5 space-y-2 print:hidden">
            {d.status === 'draft' && <Button block disabled={act.isPending} onClick={() => act.mutate('approve')}>{t('einv.approve')}</Button>}
            {d.status === 'approved' && <Button block disabled={act.isPending} onClick={() => act.mutate('release')}>{t('einv.release')}</Button>}
            {d.status === 'released_stub' && <p className="rounded-card bg-surface-2 px-4 py-3 text-ink-2">{t('einv.releasedNote')}</p>}
            <Button block variant="secondary" onClick={() => window.print()}><Printer size={18} aria-hidden />{t('einv.print')}</Button>
          </div>
        </Card>
      )}
      <ShopSheet open={shopOpen} onOpenChange={setShopOpen} />
    </main>
  );
}
