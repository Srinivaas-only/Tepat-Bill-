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
import { Download, Send } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Submission { ok: boolean; env: string; submissionUid?: string; detail: string; accepted?: { uuid: string }[]; rejected?: { error?: { message?: string } }[] }
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between gap-4 py-2"><dt className="text-ink-2">{k}</dt><dd className="num text-right font-semibold">{v}</dd></div>;

export default function EInvoice() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['einvoice', id], queryFn: () => api.get<{ draft: SelfBilledDraft | null; submission: Submission | null; myinvois: { configured: boolean; env: string } }>(`/invoices/${id}/einvoice`) });
  const act = useMutation({
    mutationFn: (p: 'approve' | 'release') => api.post<{ draft: SelfBilledDraft }>(`/invoices/${id}/einvoice/${p}`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['einvoice', id] }), onError: () => toast.error(t('common.error')),
  });
  const submit = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/einvoice/submit`, {}),
    onSuccess: () => { toast.success(t('einv.submitOk')); void qc.invalidateQueries({ queryKey: ['einvoice', id] }); },
    onError: () => { toast.error(t('einv.submitFail')); void qc.invalidateQueries({ queryKey: ['einvoice', id] }); },
  });
  const sub = q.data?.submission ?? null;
  const cfg = q.data?.myinvois;
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
          <div className="mb-4 flex items-start justify-between gap-3"><p className={`eyebrow ${sub?.ok ? 'text-ok' : 'text-notord'}`}>{sub?.ok ? t('einv.submittedRibbon', { env: sub.env }) : t('einv.ribbon')}</p><Stamp status="ok" label={t(`einv.status.${d.status}` as Key)} /></div>
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
          <div className="mt-5 space-y-2">
            {d.status === 'draft' && <Button block disabled={act.isPending} onClick={() => act.mutate('approve')}>{t('einv.approve')}</Button>}
            {d.status === 'approved' && <Button block disabled={act.isPending} onClick={() => act.mutate('release')}>{t('einv.release')}</Button>}
            {d.status === 'released_stub' && !sub?.ok && <p className="rounded-card bg-surface-2 px-4 py-3 text-ink-2">{t('einv.releasedNote')}</p>}
            {d.status !== 'draft' && <Button block variant="secondary" asChild><a href={`/api/invoices/${id}/einvoice/myinvois.json`} download><Download size={18} aria-hidden />{t('einv.download')}</a></Button>}
            {d.status !== 'draft' && !sub?.ok && cfg?.configured && <Button block disabled={submit.isPending} onClick={() => submit.mutate()}><Send size={18} aria-hidden />{t('einv.submit', { env: cfg.env })}</Button>}
            {d.status !== 'draft' && !sub?.ok && cfg && !cfg.configured && <p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-2">{t('einv.notConfigured')}</p>}
            {sub && <p className={`rounded-card px-4 py-3 text-sm ${sub.ok ? 'bg-ok-bg text-ok' : 'bg-notord-bg text-notord'}`}>{sub.ok ? t('einv.submitted', { uid: sub.submissionUid ?? '', env: sub.env }) : t('einv.submitRejected', { why: sub.rejected?.[0]?.error?.message ?? sub.detail })}</p>}
          </div>
        </Card>
      )}
    </main>
  );
}
