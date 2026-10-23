export function Logo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" role="img" aria-label="Tepat Bill">
      <rect width="56" height="56" rx="16" fill="#18181B" />
      <rect x=".5" y=".5" width="55" height="55" rx="15.5" fill="none" stroke="#fff" strokeOpacity=".14" />
      <path d="M17 14h22v28l-4-3-3.5 3-3.5-3-3.5 3-3.5-3-4 3V14z" fill="#FAFAFA" />
      <path d="M22 26l4 4 8-9" fill="none" stroke="#2457D6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
