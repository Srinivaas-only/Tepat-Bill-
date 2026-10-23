import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';
import { fmtDate } from '@/lib/dates';
import { Page, EmptyState, ErrorState } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PoRow { id: string; poNo: string; supplierName: string; orderedAt: number; lineCount: number }
interface InvRow { id: string; invoiceNo: string; supplierName: string; totalSen: number; issuedAt: number; payment: string; state: string }
interface DelRow { id: string; doNo: string; supplierName: string; receivedAt: number; state: 'issue' | 'billed' | 'correct' | 'waiting' }
type Tab = 'po' | 'invoice' | 'delivery';
const stateTone = { recorded: 'neutral', has_flags: 'short', correct: 'ok' } as const;
const delTone = { issue: 'short', correct: 'ok', waiting: 'neutral', billed: 'neutral' } as const;
const row = 'flex min-h-[64px] items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0';

export default function Orders() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>('invoice');
  const pos = useQuery({ queryKey: ['pos'], refetchOnMount: 'always', queryFn: () => api.get<{ pos: PoRow[] }>('/pos') });
  const invs = useQuery({ queryKey: ['invoices'], refetchOnMount: 'always', queryFn: () => api.get<{ invoices: InvRow[] }>('/invoices') });
  const dels = useQuery({ queryKey: ['deliveries'], refetchOnMount: 'always', queryFn: () => api.get<{ deliveries: DelRow[] }>('/deliveries') });
  const q = tab === 'po' ? pos : tab === 'invoice' ? invs : dels;
  const list = (tab === 'po' ? pos.data?.pos : tab === 'invoice' ? invs.data?.invoices : dels.data?.deliveries) ?? [];
  return (
    <Page band title={t('more.orders')}>
      <Tabs value={tab} onValueChange={v => setTab(v as Tab)} className="mb-4">
        <TabsList><TabsTrigger value="invoice">{t('orders.invoice')}</TabsTrigger><TabsTrigger value="po">{t('orders.po')}</TabsTrigger><TabsTrigger value="delivery">{t('orders.tab.deliveries')}</TabsTrigger></TabsList>
      </Tabs>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[64px] w-full" />)}</div> : list.length === 0 ? (
        <EmptyState text={t('orders.empty')}><Button asChild><Link href="/scan">{t('orders.scanCta')}</Link></Button></EmptyState>
      ) : (
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          {tab === 'po' && pos.data?.pos.map(p => (
            <Link key={p.id} href={`/orders/po/${p.id}`} className={row}>
              <div className="min-w-0"><p className="num font-semibold">{p.poNo}</p><p className="truncate text-sm text-ink-2">{p.supplierName}</p><p className="num text-xs text-ink-2">{fmtDate(p.orderedAt, lang)}</p></div>
              <p className="num shrink-0 text-sm text-ink-2">{t('orders.lines', { n: p.lineCount })}</p>
            </Link>
          ))}
          {tab === 'invoice' && invs.data?.invoices.map(v => (
            <Link key={v.id} href={`/invoices/${v.id}`} className={row}>
              <div className="min-w-0"><p className="num font-semibold">{v.invoiceNo}</p><p className="truncate text-sm text-ink-2">{v.supplierName}</p><p className="text-xs text-ink-2"><span className="num">{fmtDate(v.issuedAt, lang)}</span> · {t(v.payment === 'paid' ? 'orders.paid' : 'orders.unpaid')}</p></div>
              <div className="flex shrink-0 flex-col items-end gap-1"><Money sen={v.totalSen} className="font-semibold" /><Badge tone={stateTone[v.state as keyof typeof stateTone] ?? 'neutral'}>{t(`orders.state.${v.state}` as Key)}</Badge></div>
            </Link>
          ))}
          {tab === 'delivery' && dels.data?.deliveries.map(v => (
            <Link key={v.id} href={`/deliveries/${v.id}/count`} className={row}>
              <div className="min-w-0"><p className="num font-semibold">{v.doNo}</p><p className="truncate text-sm text-ink-2">{v.supplierName}</p><p className="num text-xs text-ink-2">{fmtDate(v.receivedAt, lang)}</p></div>
              <Badge tone={delTone[v.state]} className="shrink-0">{v.state === 'billed' ? t('flag.broughtToInvoice') : t(`deliveries.state.${v.state}` as Key)}</Badge>
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
