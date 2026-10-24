import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { toMsisdn, waLink } from '@shared/core';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

interface Msg { text: string; link: string; phone: string | null; flagIds: string[]; preview?: boolean; supplierId?: string }

function WaGlyph() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1.100.1-1.800-.1-.4-.1-1-.3-1.700-.7-2.800-1.200-4.600-4.100-4.700-4.300-.1-.2-1.100-1.500-1.100-2.800 0-1.400.7-2 1-2.300.2-.3.5-.3.700-.3h.5c.2 0 .4 0 .6.500l.8 2c.1.200.1.400 0 .5l-.4.500-.4.400c-.1.200-.3.400-.1.700.2.300.8 1.300 1.700 2.100 1.100 1 2.100 1.300 2.400 1.500.3.100.5.100.6-.1l.9-1.100c.2-.2.400-.2.600-.1l2 .9c.3.1.4.2.5.3.1.2.1.8-.1 1.400Z" /></svg>;
}

export function MessageSheet({ flagId, open, onOpenChange, reminder, request }: { flagId: string; open: boolean; onOpenChange: (o: boolean) => void; reminder: boolean; request?: string }) {
  const { t, lang: uiLang } = useI18n();
  const qc = useQueryClient();
  const [lang, setLang] = useState<'ms' | 'en'>(uiLang === 'en' ? 'en' : 'ms');
  // capture `reminder` once per opening: a refetch after "sent" must not flip an in-flight first send into a reminder
  const [rem] = useState(reminder); // parent remounts this component (key) on every opening
  const q = useQuery({ queryKey: ['message', flagId, lang, rem, request], enabled: open, gcTime: 0,
    queryFn: () => api.get<Msg>(`/flags/${flagId}/message?lang=${lang}${rem ? '&reminder=1' : ''}${request ? `&request=${request}` : ''}`) });
  const sent = useMutation({
    // keepalive: the request must survive the browser being backgrounded by WhatsApp
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/flags/sent', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flagIds: ids, reminder: rem }) });
      if (!res.ok) throw new Error(`sent ${res.status}`);
    },
    onError: () => toast.error(t('common.error')),
    onSuccess: () => { for (const k of ['flag', 'flags', 'home', 'invoice']) void qc.invalidateQueries({ queryKey: [k] }); },
  });
  const m = q.data;
  const [text, setText] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(() => { if (m) setPhone(m.phone ?? ''); }, [m?.phone]);
  const validPhone = !!toMsisdn(phone);
  useEffect(() => { if (m) setText(m.text); }, [m?.text]);
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' });
  /** Open WhatsApp from inside the tap handler (popup blockers allow it), fall back to same-tab navigation, and only close the sheet afterwards: unmounting the link mid-click cancels the navigation on some mobile browsers. */
  const openWhatsApp = (e: React.MouseEvent, url: string, ids: string[], saveFor?: string, num?: string) => {
    e.preventDefault();
    let w: Window | null = null;
    try { w = window.open(url, '_blank'); if (w) w.opener = null; } catch { w = null; }   // (a 'noopener' feature would return null even on success)
    if (!w) window.location.href = url;
    sent.mutate(ids);
    if (saveFor && num) void api.patch(`/suppliers/${saveFor}`, { whatsapp: num.trim() }).catch(() => undefined);   // remember the number for next time
    setTimeout(() => onOpenChange(false), 600);
  };
  const copy = async () => { if (!m) return; try { await navigator.clipboard.writeText(text); toast.success(t('flag.copied')); } catch { toast.error(t('common.error')); } };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t('flag.msgTitle')}>
        <div className="space-y-3">
          <Tabs value={lang} onValueChange={v => setLang(v as 'ms' | 'en')}><TabsList><TabsTrigger value="ms">{t('flag.langMs')}</TabsTrigger><TabsTrigger value="en">{t('flag.langEn')}</TabsTrigger></TabsList></Tabs>
          {!m ? <Skeleton className="h-56 w-full" /> : (
            <>
              <div className="rounded-card bg-surface-2 p-3">
                <div className="relative ml-auto max-w-[94%] rounded-card rounded-tr-sm bg-surface p-3">
                  <textarea aria-label={t('flag.msgTitle')} value={text} onChange={e => setText(e.target.value)} rows={9}
                    className="max-h-[36dvh] w-full resize-none rounded-md bg-transparent font-sans text-sm leading-5 outline-none focus-visible:outline-2 focus-visible:outline-brand" />
                  <span className="num block text-right text-[11px] text-ink-2">{now}</span>
                </div>
              </div>
              {m.preview ? <p className="rounded-card bg-surface-2 px-4 py-3 text-sm text-ink-2">{t('flag.draftPreviewNote')}</p> : <>
                <div>
                  <label htmlFor="wa-num" className="mb-1 block text-sm font-medium text-ink-2">{t('flag.waNumber')}</label>
                  <input id="wa-num" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="012-345 6789"
                    className="num w-full rounded-btn border border-line bg-surface p-3 text-base focus-visible:border-brand" />
                  {!phone.trim() && <p className="mt-1 text-xs text-ink-2">{t('flag.noNumber')}</p>}
                  {phone.trim() && !validPhone && <p className="mt-1 text-xs text-short">{t('flag.waBadNumber')}</p>}
                </div>
                <Button variant="wa" block asChild>
                  <a href={waLink(text, validPhone ? phone : undefined)} target="_blank" rel="noopener noreferrer" onClick={e => openWhatsApp(e, waLink(text, validPhone ? phone : undefined), m.flagIds, validPhone && phone !== (m.phone ?? '') ? m.supplierId : undefined, phone)}><WaGlyph />{t('flag.openWa')}</a>
                </Button>
                <p className="text-xs text-ink-2">{t('flag.waHelp')}</p>
              </>}
              <Button variant="secondary" block onClick={copy}><Copy size={18} aria-hidden />{t('flag.copy')}</Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
