import { useState } from 'react';
import { motion, useAnimationControls } from 'motion/react';
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
  const [busy, setBusy] = useState(false);
  const shake = useAnimationControls();

  const submit = async (p: string) => {
    setBusy(true);
    try { await login(p); }
    catch (e) {
      buzz(12);
      setMsg(e instanceof ApiError && e.status === 429 ? t('login.limited') : t('login.wrong'));
      await shake.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.4 } });
      setPin('');
    } finally { setBusy(false); }
  };
  const press = (d: string) => {
    if (busy || pin.length >= 4) return;
    setMsg('');
    const next = pin + d;
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center px-5 pb-8 pt-14">
      <Logo />
      <h1 className="mt-4 text-[28px] font-semibold leading-[34px]">{t('app.name')}</h1>
      <p className="mt-1 text-center text-ink-2">{t('app.tagline')}</p>
      <h2 className="mt-10 text-xl font-semibold">{t('login.title')}</h2>
      <p className="text-sm text-ink-2">{t('login.sub')}</p>
      <motion.div animate={shake} className="mt-6 flex gap-4" role="status" aria-label={`${pin.length}/4`}>
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={`h-[14px] w-[14px] rounded-full border-2 transition-colors ${i < pin.length ? 'border-brand bg-brand' : 'border-line bg-surface'}`} />
        ))}
      </motion.div>
      <p className="mt-3 h-6 text-sm font-medium text-notord" aria-live="polite">{msg}</p>
      <div className="mt-4 grid grid-cols-3 gap-x-5 gap-y-4">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <Key key={d} onClick={() => press(d)}>{d}</Key>)}
        <span />
        <Key onClick={() => press('0')}>0</Key>
        <Key onClick={() => { setPin(p => p.slice(0, -1)); setMsg(''); }} aria-label={t('login.backspace')}><Delete size={26} strokeWidth={1.5} /></Key>
      </div>
      <button className="mt-auto min-h-11 pt-6 text-sm font-medium text-ink-2" onClick={() => setLang(lang === 'ms' ? 'en' : 'ms')}>
        {lang === 'ms' ? 'English' : 'Bahasa Melayu'}
      </button>
    </div>
  );
}

function Key({ children, onClick, ...p }: { children: React.ReactNode; onClick: () => void } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button whileTap={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }} onClick={onClick}
      className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-surface-2 text-[28px] font-semibold text-ink" {...(p as object)}>
      {children}
    </motion.button>
  );
}
