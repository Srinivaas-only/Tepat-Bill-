import { useSyncExternalStore } from 'react';
let open = false;
const subs = new Set<() => void>();
const set = (v: boolean) => { open = v; subs.forEach(f => f()); };
export const openIntro = () => set(true);
export const closeIntro = () => set(false);
export const useIntroOpen = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => open);
