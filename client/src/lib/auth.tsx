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
    queryFn: async () => {
      try { return (await api.get<{ role: Role }>('/auth/me')).role; }
      catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
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
