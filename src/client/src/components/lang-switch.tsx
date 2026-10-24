import { useI18n } from '@/i18n';

/** Always-visible BM | EN switch (the Settings tab is too hidden for a first-time user). */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div role="group" aria-label="Bahasa / Language" className={`inline-flex rounded-full bg-white/10 p-0.5 text-xs font-semibold ring-1 ring-white/15 backdrop-blur ${className}`}>
      {(['ms', 'en'] as const).map(l => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
          className={`press min-h-8 min-w-10 rounded-full px-3 ${lang === l ? 'bg-white text-black' : 'text-ink-2'}`}>{l === 'ms' ? 'BM' : 'EN'}</button>
      ))}
    </div>
  );
}
