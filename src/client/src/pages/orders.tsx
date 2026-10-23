import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ClipboardList } from 'lucide-react';
import { formatRM } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Page, EmptyState } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listItem } from '@/lib/motion';

interface PoRow { id: string; poNo: string; supplierName: string; orderedAt: number; lineCount: number }
interface InvRow { id: string; invoiceNo: string; supplierName: string; totalSen: number; issuedAt: number }
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB');

export default function Orders() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'po' | 'invoice'>('invoice');
  const pos = useQuery({ queryKey: ['pos'], queryFn: () => api.get<{ pos: PoRow[] }>('/pos') });
  const invs = useQuery({ queryKey: ['invoices'], queryFn: () => api.get<{ invoices: InvRow[] }>('/invoices') });
  const q = tab === 'po' ? pos : invs;
  return (
    <Page title={t('more.orders')}>
      <Tabs value={tab} onValueChange={v => setTab(v as 'po' | 'invoice')} className="mb-4">
        <TabsList><TabsTrigger value="invoice">{t('orders.invoice')}</TabsTrigger><TabsTrigger value="po">{t('orders.po')}</TabsTrigger></TabsList>
      </Tabs>
      {q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-[72px] w-full" />)}</div> : (
        <div className="space-y-3">
          {tab === 'po' && pos.data?.pos.map((p, i) => (
            <motion.div key={p.id} {...listItem(i)}><Card className="flex min-h-[72px] items-center justify-between p-4">
              <div><p className="tnum font-semibold">{p.poNo}</p><p className="text-sm text-ink-2">{p.supplierName} · {day(p.orderedAt)}</p></div>
              <p className="tnum text-sm text-ink-2">{t('orders.lines', { n: p.lineCount })}</p></Card></motion.div>
          ))}
          {tab === 'invoice' && invs.data?.invoices.map((v, i) => (
            <motion.div key={v.id} {...listItem(i)}><Link href={`/invoices/${v.id}`}><Card className="flex min-h-[72px] items-center justify-between p-4">
              <div><p className="tnum font-semibold">{v.invoiceNo}</p><p className="text-sm text-ink-2">{v.supplierName} · {day(v.issuedAt)}</p></div>
              <p className="tnum font-semibold">{formatRM(v.totalSen)}</p></Card></Link></motion.div>
          ))}
          {((tab === 'po' ? pos.data?.pos : invs.data?.invoices) ?? []).length === 0 && <EmptyState icon={<ClipboardList size={26} strokeWidth={1.5} />} text={t('orders.empty')} />}
        </div>
      )}
    </Page>
  );
}
