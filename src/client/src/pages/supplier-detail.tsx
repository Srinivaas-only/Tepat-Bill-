import { Link, useParams } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { toMsisdn } from '@shared/core';
import { Input } from '@/components/ui/input';
import { fmtDate } from '@/lib/dates';
import { FlagLedger, type FlagView } from '@/components/flag-card';
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
import { ErrorState, BackButton, SectionLabel } from '@/components/page';
import { Skeleton } from '@/components/ui/skeleton';

interface InvRow {
  id: string; invoiceNo: string; totalSen: number; issuedAt: number; dueAt: number; payment: 'paid' | 'on_credit'; state: 'recorded' | 'has_flags' | 'correct'; canMarkCorrect: boolean;
  ledger: { reductionSen: number; creditAppliedSen: number; netOwedSen: number } | null;
}
interface Data {
  supplier: { id: string; name: string; policyNote: string | null; whatsapp: string | null; isForeign: boolean; country: string | null };
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
  const fl = useQuery({ queryKey: ['flags', 'supplier', id], queryFn: () => api.get<{ flags: FlagView[] }>(`/flags?supplierId=${id}`).then(r => ({ flags: r.flags.filter(f => !f.supersededBy && f.status !== 'dismissed') })) });
  const [note, setNote] = useState(''); const [wa, setWa] = useState(''); const [foreign, setForeign] = useState(false);
  const sup = q.data?.supplier;
  useEffect(() => { if (sup) { setNote(sup.policyNote ?? ''); setWa(sup.whatsapp ?? ''); setForeign(sup.isForeign); } }, [sup?.id, sup?.policyNote, sup?.whatsapp, sup?.isForeign]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveSup = useMutation({
    mutationFn: () => api.patch(`/suppliers/${id}`, { policyNote: note.trim() || null, whatsapp: wa.trim() || null, isForeign: foreign }),
    onSuccess: () => { toast.success(t('sup.saved')); refresh(); void qc.invalidateQueries({ queryKey: ['suppliers'] }); }, onError: () => toast.error(t('common.error')),
  });
  const setDue = useMutation({
    mutationFn: (a: { invId: string; dueAt: number }) => api.patch(`/invoices/${a.invId}/payment`, { dueAt: a.dueAt }),
    onSuccess: refresh, onError: () => toast.error(t('common.error')),
  });
  const d = q.data;
  const owner = !!role && can(role, 'mark_paid');
  const { lang } = useI18n();
  const date = (n: number) => fmtDate(n, lang);
  const msisdn = wa.trim() ? toMsisdn(wa) : null;
  return (
    <main className="px-5 pb-10 pt-[calc(16px+var(--safe-top))]">
      <BackButton fallback="/suppliers" />
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : !d ? <div className="space-y-3"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-32 w-full" /></div> : (
        <div className="stagger space-y-5">
          <h1 className="page-title">{d.supplier.name}</h1>
          <div className="edge rounded-card p-5 text-ink shadow-raised" style={{ background: 'var(--grad-band)' }}>
            <p className="eyebrow">{t('supplier.payNow')}</p>
            <Money sen={d.ledger.payNowSen} animate className="mt-1 block text-display font-semibold tracking-[-0.03em]" />
            <dl className="mt-4 divide-y divide-white/10 border-t border-white/10 text-sm">
              <div className="flex items-center justify-between gap-3 py-2"><dt className="text-ink-2">{t('supplier.disputed')}</dt><dd><Money sen={d.ledger.disputedSen} animate className="font-semibold" /></dd></div>
              <div className="flex items-center justify-between gap-3 py-2"><dt className="text-ink-2">{t('supplier.creditLabel')}</dt><dd><Money sen={d.ledger.creditCarrySen} animate className="font-semibold" /></dd></div>
              <div className="flex items-center justify-between gap-3 py-2"><dt className="text-ink-2">{t('supplier.statement')}</dt><dd><Money sen={d.ledger.owedSen} animate className="font-semibold" /></dd></div>
            </dl>
            {d.ledger.creditCarrySen > 0 && <p className="mt-2 text-sm font-medium text-ok">{t('supplier.credit', { rm: formatMoney(d.ledger.creditCarrySen, 'MYR') })}</p>}
            <p className="mt-2 text-caption text-ink-2">{t('sup.statementHelp')}</p>
          </div>
          <section>
            <SectionLabel>{t('sup.invoices')}</SectionLabel>
            {d.invoices.length === 0 ? <p className="text-ink-2">{t('sup.noInvoices')}</p> : (
              <div className="overflow-hidden rounded-card bg-surface shadow-card">{d.invoices.map(i => (
                <div key={i.id} className="space-y-2 border-t border-line p-4 first:border-t-0">
                  <div className="flex items-start justify-between gap-3">
                    <div><Link href={`/invoices/${i.id}`} className="num inline-flex min-h-11 items-center font-semibold text-brand-text">{i.invoiceNo}</Link><p className="text-xs text-ink-2">{date(i.issuedAt)} · {i.payment === 'paid' ? t('sup.paid') : t('sup.due', { date: date(i.dueAt) })}</p></div>
                    <div className="text-right"><Money sen={i.totalSen} className="font-semibold" /><div className="mt-1 flex justify-end"><Badge tone={tone[i.state]}>{t(`sup.state.${i.state}` as Key)}</Badge></div></div>
                  </div>
                  {i.payment === 'on_credit' && i.ledger && (i.ledger.reductionSen > 0 || i.ledger.creditAppliedSen > 0) && (
                    <p className="num text-sm text-ink-2">
                      {i.ledger.reductionSen > 0 && <>{t('sup.reduced', { rm: formatMoney(i.ledger.reductionSen, 'MYR') })} · </>}
                      {i.ledger.creditAppliedSen > 0 && <>{t('sup.creditApplied', { rm: formatMoney(i.ledger.creditAppliedSen, 'MYR') })} · </>}
                      {t('sup.net')} <b className="text-ink">{formatMoney(i.ledger.netOwedSen, 'MYR')}</b>
                    </p>)}
                  {owner && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ invId: i.id, kind: i.payment === 'paid' ? 'unpay' : 'pay' })}>{t(i.payment === 'paid' ? 'sup.markUnpaid' : 'sup.markPaid')}</Button>
                      {i.payment !== 'paid' && <label className="inline-flex min-h-11 items-center gap-2 text-xs text-ink-2">{t('sup.dueDate')}<input type="date" aria-label={t('sup.dueDate')} defaultValue={new Date(i.dueAt + 8 * 3600e3).toISOString().slice(0, 10)} onChange={e => { const v = e.target.valueAsNumber; if (Number.isFinite(v)) setDue.mutate({ invId: i.id, dueAt: v + 8 * 3600e3 }); }} className="num rounded-btn border border-line bg-surface px-2 py-1 text-sm text-ink" /></label>}
                      {i.state !== 'correct' && i.canMarkCorrect && <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => act.mutate({ invId: i.id, kind: 'correct' })}>{t('sup.markCorrect')}</Button>}
                    </div>)}
                </div>))}</div>
            )}
          </section>
          <section>
            <SectionLabel count={fl.data?.flags.length}>{t('sup.flags')}</SectionLabel>
            {fl.data && (fl.data.flags.length === 0 ? <p className="text-ink-2">{t('sup.noFlags')}</p> : <FlagLedger flags={fl.data.flags} />)}
          </section>
          <section>
            <SectionLabel>{t('sup.settings')}</SectionLabel>
            <Card className="space-y-3 p-4">
              <div><label htmlFor="pn" className="mb-1 block text-sm font-medium text-ink-2">{t('sup.policyNote')}</label>
                <textarea id="pn" value={note} readOnly={!owner} onChange={e => setNote(e.target.value)} rows={3} maxLength={500} className="w-full rounded-btn border border-line-strong bg-surface p-3 text-base read-only:bg-surface-2" /></div>
              <div><label htmlFor="wa" className="mb-1 block text-sm font-medium text-ink-2">{t('sup.whatsapp')}</label>
                <Input id="wa" inputMode="tel" value={wa} readOnly={!owner} onChange={e => setWa(e.target.value)} className="num" />
                {wa.trim() && <p className={`mt-1 text-xs ${msisdn ? 'text-ok' : 'text-notord'}`}>{msisdn ? t('sup.waOk', { n: msisdn }) : t('sup.waBad')}</p>}</div>
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={foreign} disabled={!owner} onChange={e => setForeign(e.target.checked)} className="h-5 w-5 accent-[var(--brand)]" />{t('sup.foreign')}</label>
              {owner && <Button block disabled={saveSup.isPending} onClick={() => saveSup.mutate()}>{t('sup.save')}</Button>}
            </Card>
          </section>
        </div>
      )}
    </main>
  );
}
