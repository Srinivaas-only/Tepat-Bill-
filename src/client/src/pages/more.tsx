import { Link } from 'wouter';
import { ChevronRight, ClipboardList, History, Settings, Sparkles } from 'lucide-react';
import { openIntro } from '@/lib/intro';
import { Page } from '@/components/page';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n';
import type { Key } from '@/i18n/ms';

const rows: { to: string; key: Key; icon: typeof Settings }[] = [
  { to: '/orders', key: 'more.orders', icon: ClipboardList },
  { to: '/activity', key: 'more.activity', icon: History },
  { to: '/settings', key: 'more.settings', icon: Settings },
];
export default function More() {
  const { t } = useI18n();
  return (
    <Page band title={t('more.title')}>
      <Card className="divide-y divide-line overflow-hidden">
        {rows.map(r => (
          <Link key={r.to} href={r.to} className="press flex min-h-14 items-center gap-3 px-4 font-medium">
            <r.icon size={22} strokeWidth={1.5} className="text-brand-text" aria-hidden />
            <span className="flex-1">{t(r.key)}</span>
            <ChevronRight size={20} className="text-ink-2" aria-hidden />
          </Link>
        ))}
        <button type="button" onClick={openIntro} className="press flex min-h-14 w-full items-center gap-3 px-4 text-left font-medium">
          <Sparkles size={22} strokeWidth={1.5} className="text-brand-text" aria-hidden />
          <span className="flex-1">{t('intro.guide')}</span>
          <ChevronRight size={20} className="text-ink-2" aria-hidden />
        </button>
      </Card>
    </Page>
  );
}
