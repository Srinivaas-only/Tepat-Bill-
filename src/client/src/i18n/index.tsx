import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ms, type Key } from './ms';
import { en } from './en';

export type Lang = 'ms' | 'en';
const dicts: Record<Lang, Record<Key, string>> = { ms, en };

interface I18n { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, vars?: Record<string, string | number>) => string }
const Ctx = createContext<I18n | null>(null);

const initial = (): Lang => (typeof localStorage !== 'undefined' && localStorage.getItem('tb_lang') === 'en' ? 'en' : 'ms');

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('tb_lang', l);
    document.documentElement.lang = l;
    setLangState(l);
  }, []);
  const t = useCallback((k: Key, vars?: Record<string, string | number>) => {
    let s = dicts[lang][k] ?? ms[k] ?? k;
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replaceAll(`{${a}}`, String(b));
    return s;
  }, [lang]);
  const v = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}
export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error('I18nProvider missing');
  return c;
}
