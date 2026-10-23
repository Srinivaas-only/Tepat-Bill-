import type { ReactNode } from 'react';

/** A radio-ledger row: 20px dot, 3px brand bar on the left when selected. Use inside role="radiogroup". */
export function RadioRow({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick} className="relative flex min-h-[52px] w-full items-center gap-3 border-t border-line py-2 pl-5 pr-4 text-left first:border-t-0">
      {checked && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand-text" />}
      <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-brand-text' : 'border-line-strong'}`}>{checked && <span className="h-2.5 w-2.5 rounded-full bg-brand-text" />}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}
