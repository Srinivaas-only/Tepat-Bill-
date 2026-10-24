import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';
import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/i18n';
import { ApiError } from '@/lib/api';
import { ms } from '@/i18n/ms';
import { en } from '@/i18n/en';
import { initSpotlight } from '@/lib/spotlight';
import { initRipple } from '@/lib/ripple';
import App from './App';

initSpotlight();
initRipple();

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
    const L = (localStorage.getItem('tb_lang') ?? 'ms') === 'en' ? en : ms;
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-ink-2">{L['common.error']}</p>
        <button type="button" className="h-12 rounded-full bg-brand px-6 font-semibold text-brand-ink" onClick={() => location.reload()}>{L['common.reload']}</button>
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
          <Toaster position="bottom-center" offset={96} style={{ '--normal-bg': 'var(--surface-3)', '--normal-text': 'var(--ink)', '--normal-border': 'var(--line)', '--border-radius': '16px' } as React.CSSProperties} toastOptions={{ style: { fontFamily: 'inherit', fontSize: 14 } }} />
        </I18nProvider>
      </MotionConfig>
    </QueryClientProvider>
  </ErrorBoundary>,
);
