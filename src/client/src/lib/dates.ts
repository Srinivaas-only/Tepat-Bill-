/** Numeric DD/MM/YYYY in Kuala Lumpur time, in the UI language. */
export const fmtDate = (ms: number | string, lang: 'ms' | 'en') => {
  const d = typeof ms === 'string' ? new Date(`${ms.slice(0, 10)}T12:00:00+08:00`) : new Date(ms);
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
};
