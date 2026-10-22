import { parseRM, formatRM } from '@shared/core';

const MONEY = /^\d+(\.\d{1,2})?$/;
export const isMoney = (s: string) => MONEY.test(s.trim());
/** "45.00" -> sen (integer) via core parseRM; undefined when empty/invalid. */
export const toSen = (s: string): number | undefined => (isMoney(s) ? parseRM(s.trim()) : undefined);
/** Decimal rate string -> basis points without floats: "4.20" -> 42000. */
export function toBp(s: string): number | undefined {
  const t = s.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return undefined;
  const [i, f = ''] = t.split('.');
  return Number(i) * 10000 + Number(f.padEnd(4, '0'));
}
/** Amount in the invoice currency: MYR -> RM1.00, otherwise "USD 1.00". */
export const formatMoney = (minor: number, currency: string) =>
  currency.toUpperCase() === 'MYR' ? formatRM(minor) : formatRM(minor).replace('RM', `${currency.toUpperCase()} `);
