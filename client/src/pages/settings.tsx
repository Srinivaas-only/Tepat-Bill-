import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { can } from '@shared/core';
import { Download, RotateCcw, LogOut, ChevronRight, Send } from 'lucide-react';
import { Page, SectionLabel } from '@/components/page';
import { Badge } from '@/components/ui/badge';
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
  const [handoff, setHandoff] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const showPayload = async () => { try { const r = await api.get<{ mode: string; payload: unknown }>('/accounting/payload'); setPreview(JSON.stringify(r.payload, null, 2)); } catch { toast.error(t('common.error')); } };
  const simulate = async () => {
    setHandoff(true);
    try { const r = await api.post<{ invoices: number; approvedFlags: number; mode: string; ok: boolean }>('/accounting/handoff', {}); if (r.ok) toast.success(t('settings.handoffDone', { i: r.invoices, f: r.approvedFlags })); else toast.error(t('settings.handoffFail')); } catch { toast.error(t('common.error')); } finally { setHandoff(false); }
  };
  const reset = async () => {
    setConfirm(false);
    try { await api.post('/dev/reset', {}); toast.success(t('settings.resetDone')); setTimeout(() => window.location.assign('/'), 600); } catch { toast.error(t('common.error')); }
  };
  return (
    <Page band title={t('more.settings')}>
      <div className="stagger space-y-5">
        <section>
          <SectionLabel>{t('settings.language')}</SectionLabel>
          <Tabs value={lang} onValueChange={v => setLang(v as Lang)}>
            <TabsList><TabsTrigger value="ms">Bahasa Melayu</TabsTrigger><TabsTrigger value="en">English</TabsTrigger></TabsList>
          </Tabs>
        </section>
        <Card className="flex min-h-14 items-center justify-between gap-3 px-4">
          <span className="flex items-center gap-2 text-ink-2">{role && <Badge tone={role === 'owner' ? 'brand' : 'neutral'}>{t(role === 'owner' ? 'role.owner' : 'role.staff')}</Badge>}</span>
          {checks.data && <span className="flex items-baseline gap-2"><span className="text-ink-2">{t('settings.checks')}</span><span className="num text-xl font-semibold">{checks.data.checksLeft}</span></span>}
        </Card>
        <Card className="divide-y divide-line overflow-hidden">
          {owner && <a href="/api/export.csv" download className="press flex min-h-14 items-center gap-3 px-4 font-medium [--p:.985]"><Download size={22} strokeWidth={1.5} className="text-brand-text" aria-hidden /><span className="flex-1">{t('settings.export')}</span><ChevronRight size={20} className="text-ink-3" aria-hidden /></a>}
          <button type="button" onClick={() => void logout()} className="press flex min-h-14 w-full items-center gap-3 px-4 text-left font-medium [--p:.985]"><LogOut size={22} strokeWidth={1.5} className="text-brand-text" aria-hidden /><span className="flex-1">{t('settings.switchUser')}</span><ChevronRight size={20} className="text-ink-3" aria-hidden /></button>
          {owner && <button type="button" disabled={handoff} onClick={() => void simulate()} className="press flex min-h-14 w-full items-center gap-3 px-4 text-left font-medium [--p:.985]"><Send size={22} strokeWidth={1.5} className="text-brand-text" aria-hidden /><span className="flex-1">{t('settings.handoff')}<span className="block text-xs font-normal text-ink-2">{t('settings.handoffNote')}</span></span><Badge tone="neutral">{t('settings.simulation')}</Badge></button>}
          {owner && <button type="button" onClick={() => void showPayload()} className="press flex min-h-14 w-full items-center gap-3 px-4 text-left font-medium [--p:.985]"><Send size={22} strokeWidth={1.5} className="text-brand-text" aria-hidden /><span className="flex-1">{t('settings.payload')}</span><ChevronRight size={20} className="text-ink-3" aria-hidden /></button>}
          {owner && checks.data?.demo && <button type="button" onClick={() => setConfirm(true)} className="press flex min-h-14 w-full items-center gap-3 px-4 text-left font-medium text-notord [--p:.985]"><RotateCcw size={22} strokeWidth={1.5} aria-hidden /><span className="flex-1">{t('settings.reset')}</span></button>}
        </Card>
      </div>
      <Sheet open={preview !== null} onOpenChange={o => { if (!o) setPreview(null); }}>
        <SheetContent title={t('settings.payload')} description={t('settings.payloadNote')}>
          <pre className="num max-h-[50dvh] overflow-auto rounded-card bg-surface-2 p-3 text-xs">{preview}</pre>
        </SheetContent>
      </Sheet>
      <Sheet open={confirm} onOpenChange={setConfirm}>
        <SheetContent title={t('settings.reset')} description={t('settings.resetConfirm')}>
          <div className="space-y-2">
            <Button block variant="destructive" onClick={() => void reset()}>{t('settings.reset')}</Button>
            <Button block variant="secondary" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
          </div>
        </SheetContent>
      </Sheet>
      <p className="mt-6 text-center text-caption text-ink-2">{t('settings.about')}</p>
    </Page>
  );
}
