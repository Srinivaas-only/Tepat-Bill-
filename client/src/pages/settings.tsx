import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { can } from '@shared/core';
import { Page } from '@/components/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n, type Lang } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { role, logout } = useAuth();
  const owner = !!role && can(role, 'export_csv');
  const checks = useQuery({ queryKey: ['checks'], refetchOnMount: 'always', queryFn: () => api.get<{ checksLeft: number; demo: boolean }>('/checks') });
  const [confirm, setConfirm] = useState(false);
  const reset = async () => {
    setConfirm(false);
    try { await api.post('/dev/reset', {}); toast.success(t('settings.resetDone')); setTimeout(() => window.location.assign('/'), 600); } catch { toast.error(t('common.error')); }
  };
  return (
    <Page title={t('more.settings')}>
      <Card className="space-y-4 p-4">
        <div>
          <p className="mb-2 text-sm font-medium text-ink-2">{t('settings.language')}</p>
          <Tabs value={lang} onValueChange={v => setLang(v as Lang)}>
            <TabsList><TabsTrigger value="ms">Bahasa Melayu</TabsTrigger><TabsTrigger value="en">English</TabsTrigger></TabsList>
          </Tabs>
        </div>
        {checks.data && <div className="flex items-baseline justify-between"><span className="text-ink-2">{t('settings.checks')}</span><span className="tnum text-lg font-semibold">{checks.data.checksLeft}</span></div>}
        <p className="text-sm text-ink-2">{role ? t(role === 'owner' ? 'role.owner' : 'role.staff') : ''}</p>
        {owner && <Button variant="secondary" block asChild><a href="/api/export.csv" download>{t('settings.export')}</a></Button>}
        {owner && checks.data?.demo && <Button variant="ghost" block className="text-notord" onClick={() => setConfirm(true)}>{t('settings.reset')}</Button>}
        <Button variant="secondary" block onClick={() => void logout()}>{t('settings.switchUser')}</Button>
      </Card>
      <Sheet open={confirm} onOpenChange={setConfirm}>
        <SheetContent title={t('settings.reset')} description={t('settings.resetConfirm')}>
          <div className="space-y-2">
            <Button block variant="destructive" onClick={() => void reset()}>{t('settings.reset')}</Button>
            <Button block variant="secondary" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
          </div>
        </SheetContent>
      </Sheet>
      <p className="mt-4 text-center text-xs text-ink-2">{t('settings.about')}</p>
    </Page>
  );
}
