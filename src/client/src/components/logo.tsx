export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" role="img" aria-label="Tepat Bill">
      <rect width="56" height="56" rx="16" fill="var(--ink)" />
      <path d="M17 14h22v28l-4-3-3.5 3-3.5-3-3.5 3-3.5-3-4 3V14z" fill="#fff" />
      <path d="M22 26l4 4 8-9" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
