import './index.css';
import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/i18n';
import { ApiError } from '@/lib/api';
import App from './App';

const onAuthError = (e: unknown) => {
  if (e instanceof ApiError && e.status === 401 && !location.pathname.startsWith('/e/')) qc.setQueryData(['me'], null);
};
const qc: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
});

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink-2">Ada masalah. Cuba lagi.</p>
        <button type="button" className="h-12 rounded-full bg-brand px-6 font-semibold text-brand-ink" onClick={() => location.reload()}>Muat semula</button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={qc}>
      <MotionConfig reducedMotion="user">
        <I18nProvider>
          <App />
          <Toaster position="bottom-center" offset={96} toastOptions={{ classNames: { toast: 'rounded-2xl bg-ink text-white font-sans shadow-elev' } }} />
        </I18nProvider>
      </MotionConfig>
    </QueryClientProvider>
  </ErrorBoundary>,
);
