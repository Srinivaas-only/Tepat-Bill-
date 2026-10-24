import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@shared/core';
import { api, ApiError } from './api';

interface Auth { role: Role | null; loading: boolean; login: (pin: string) => Promise<Role>; logout: () => Promise<void> }
const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    /** Every page load / reload starts logged out: drop any old cookie and show the PIN screen. */
    queryFn: async (): Promise<Role | null> => {
      try { await api.post('/auth/logout'); } catch (e) { if (!(e instanceof ApiError)) throw e; }
      return null;
    },
    staleTime: Infinity, retry: false,
  });
  const login = async (pin: string) => {
    const { role } = await api.post<{ role: Role }>('/auth/login', { pin });
    qc.setQueryData(['me'], role);
    return role;
  };
  const logout = async () => {
    await api.post('/auth/logout');
    qc.removeQueries({ predicate: q => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], null);
  };
  return <Ctx.Provider value={{ role: q.data ?? null, loading: q.isLoading, login, logout }}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
