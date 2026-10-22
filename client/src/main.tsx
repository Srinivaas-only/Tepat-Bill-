import './index.css';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/i18n';
import App from './App';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={qc}>
    <I18nProvider>
      <App />
      <Toaster position="bottom-center" offset={96} />
    </I18nProvider>
  </QueryClientProvider>,
);
