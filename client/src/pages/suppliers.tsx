import { Link } from 'wouter';
import { ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/dates';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Page, EmptyState, ErrorState } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/money-input';

interface Row { id: string; name: string; owedSen: number; disputedSen: number; payNowSen: number; creditCarrySen: number; openFlags: number; nextDueAt?: number | null }

/** Initials on a hue taken from the name, so each supplier is recognisable at a glance. */
function Monogram({ name }: { name: string }) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const ini = name.split(/\s+/).filter(w => /^\p{L}/u.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ background: `linear-gradient(135deg, hsl(${h} 62% 38%), hsl(${(h + 48) % 360} 60% 24%))`, boxShadow: 'inset 0 1px 0 rgb(255 255 255 / .28), inset 0 0 0 1px rgb(255 255 255 / .12)' }}>{ini}</span>
  );
}

export default function Suppliers() {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['ledgers'], refetchOnMount: 'always', queryFn: () => api.get<{ suppliers: Row[] }>('/suppliers/ledgers') });
  const rows = q.data?.suppliers ?? [];
  return (
    <Page band title={t('nav.suppliers')}>
      {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : q.isLoading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : rows.length === 0 ? <EmptyState text={t('sup.none')}><Button asChild size="sm"><Link href="/scan"><ScanLine size={18} aria-hidden />{t('sup.scanCta')}</Link></Button></EmptyState>
        : <><p className="eyebrow mb-2 px-1 text-right">{t('sup.payNowShort')}</p>
          <div className="stagger spot overflow-hidden rounded-card bg-surface shadow-card">{rows.map(s => (
          <Link key={s.id} href={`/suppliers/${s.id}`} className="press flex min-h-[72px] items-center gap-3 border-t border-line p-4 first:border-t-0 [--p:.985]">
            <Monogram name={s.name} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-semibold leading-5">{s.name}</p>
              {s.disputedSen > 0 && <p className="mt-0.5 text-xs text-dispute">{t('sup.disputeCaption', { rm: formatMoney(s.disputedSen, 'MYR') })}</p>}
              <p className="mt-0.5 text-xs text-ink-2">{[s.openFlags > 0 ? t('sup.openFlags', { n: s.openFlags }) : '', s.nextDueAt ? t('sup.nextDue', { date: fmtDate(s.nextDueAt, lang) }) : ''].filter(Boolean).join(' · ') || '\u00a0'}</p>
              {s.creditCarrySen > 0 && <p className="mt-1 text-sm text-ok">{t('supplier.credit', { rm: formatMoney(s.creditCarrySen, 'MYR') })}</p>}
            </div>
            <Money sen={s.payNowSen} className={`text-xl font-semibold ${s.payNowSen > 0 ? '' : 'text-ink-3'}`} />
            <ChevronRight size={18} className="text-ink-3" aria-hidden />
          </Link>))}</div></>}
    </Page>
  );
}
