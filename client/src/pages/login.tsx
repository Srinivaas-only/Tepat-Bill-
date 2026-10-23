import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Delete } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { buzz } from '@/lib/haptics';
import { Logo } from '@/components/logo';

export default function Login() {
  const { login } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (p: string) => {
    setBusy(true);
    try { await login(p); }
    catch (e) {
      buzz(12);
      setMsg(e instanceof ApiError && e.status === 429 ? t('login.limited') : t('login.wrong'));
      setBad(true);                                   // dots flash red (no shake), then clear
      await new Promise(r => setTimeout(r, 420));
      setBad(false); setPin('');
    } finally { setBusy(false); }
  };
  const press = (d: string) => {
    if (busy || pin.length >= 4) return;
    setMsg('');
    const next = pin + d;
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') { setPin(p => p.slice(0, -1)); setMsg(''); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-[480px] flex-col items-center px-5 pb-8 pt-[calc(48px+var(--safe-top))]">
      <button className="press absolute right-4 top-[calc(12px+var(--safe-top))] inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-ink-2 ring-1 ring-ink/15 [@media(hover:hover)]:hover:bg-surface-2" onClick={() => setLang(lang === 'ms' ? 'en' : 'ms')}>
        {lang === 'ms' ? 'English' : 'BM'}
      </button>
      <Logo />
      <h1 className="mt-4 text-[28px] font-semibold leading-[34px] tracking-tight">{t('app.name')}</h1>
      <p className="mt-1 text-center text-ink-2">{t('app.tagline')}</p>
      <h2 className="mt-10 text-xl font-semibold">{t('login.title')}</h2>
      <p className="text-sm text-ink-2">{t('login.sub')}</p>
      <div className="mt-6 flex gap-5" role="status" aria-label={`${pin.length}/4`}>
        {[0, 1, 2, 3].map(i => (
          <motion.span key={i} animate={{ scale: i < pin.length ? 1 : 0.85 }} transition={{ type: 'spring', stiffness: 600, damping: 26 }}
            className={`h-4 w-4 rounded-full border-2 transition-colors duration-150 ${bad ? 'border-notord bg-notord' : i < pin.length ? 'border-brand bg-brand' : 'border-line-strong/60 bg-surface'}`} />
        ))}
      </div>
      <p className="mt-3 h-6 text-sm font-medium text-notord" aria-live="polite">{msg}</p>
      <div className="mt-4 grid grid-cols-3 gap-x-5 gap-y-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <Key key={d} onClick={() => press(d)}>{d}</Key>)}
        <span />
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={() => { setPin(p => p.slice(0, -1)); setMsg(''); }} aria-label={t('login.backspace')}><Delete size={26} strokeWidth={1.5} /></Key>
      </div>
    </div>
  );
}

function Key({ children, onClick, ...p }: { children: React.ReactNode; onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" onClick={onClick}
      className="press flex h-[76px] w-[76px] items-center justify-center rounded-full bg-surface text-[28px] font-semibold text-ink shadow-card transition-colors [@media(hover:hover)]:hover:bg-surface-2 active:bg-surface-2 active:!scale-[.94]" {...(p as object)}>
      {children}
    </button>
  );
}
