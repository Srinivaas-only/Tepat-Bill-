import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { useI18n } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { BottomNav } from '@/components/bottom-nav';
import { Skeleton } from '@/components/ui/skeleton';

const Login = lazy(() => import('@/pages/login'));
const Home = lazy(() => import('@/pages/home'));
const Flags = lazy(() => import('@/pages/flags'));
const Suppliers = lazy(() => import('@/pages/suppliers'));
const Scan = lazy(() => import('@/pages/scan'));
const More = lazy(() => import('@/pages/more'));
const Read = lazy(() => import('@/pages/read'));
const Review = lazy(() => import('@/pages/review'));
const Orders = lazy(() => import('@/pages/orders'));
const Count = lazy(() => import('@/pages/count'));
const Bon = lazy(() => import('@/pages/bon'));
const FlagDetail = lazy(() => import('@/pages/flag-detail'));
const Evidence = lazy(() => import('@/pages/evidence'));
const SupplierDetail = lazy(() => import('@/pages/supplier-detail'));
const Activity = lazy(() => import('@/pages/activity'));
const InvoiceDetail = lazy(() => import('@/pages/invoice-detail'));
const EInvoice = lazy(() => import('@/pages/einvoice'));
const Settings = lazy(() => import('@/pages/settings'));

const Fallback = () => <div className="space-y-3 p-5"><Skeleton className="h-8 w-40" /><Skeleton className="h-44 w-full" /></div>;

function NavGate() {
  const [loc] = useLocation();
  return /^\/(read|review|bon)\b/.test(loc) || /^\/invoices\/[^/]+\/count/.test(loc) || /^\/flags\/[^/]+/.test(loc) ? null : <BottomNav />;
}

function OfflineBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online ? null : <div role="status" className="fixed inset-x-0 top-0 z-[70] bg-dispute px-4 py-2 text-center text-sm font-medium text-white">{t('common.offline')}</div>;
}

function AppShell() {
  const { role, loading } = useAuth();
  if (loading) return <Fallback />;
  if (!role) return <Suspense fallback={<Fallback />}><Login /></Suspense>;
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] pb-24">
      <OfflineBanner />
      <Suspense fallback={<Fallback />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/flags" component={Flags} />
          <Route path="/flags/:id" component={FlagDetail} />
          <Route path="/suppliers" component={Suppliers} />
          <Route path="/suppliers/:id" component={SupplierDetail} />
          <Route path="/scan" component={Scan} />
          <Route path="/read/:id" component={Read} />
          <Route path="/review/:kind/:id" component={Review} />
          <Route path="/invoices/:id/count" component={Count} />
          <Route path="/invoices/:id/einvoice" component={EInvoice} />
          <Route path="/invoices/:id" component={InvoiceDetail} />
          <Route path="/bon/:docId" component={Bon} />
          <Route path="/orders" component={Orders} />
          <Route path="/activity" component={Activity} />
          <Route path="/more" component={More} />
          <Route path="/settings" component={Settings} />
          <Route><More /></Route>
        </Switch>
      </Suspense>
      <NavGate />
    </div>
  );
}

export default function App() {
  return (
    <Switch>
      {/* public evidence page: outside the session guard, never calls /api/auth/me */}
      <Route path="/e/:token"><Suspense fallback={<Fallback />}><Evidence /></Suspense></Route>
      <Route><AuthProvider><AppShell /></AuthProvider></Route>
    </Switch>
  );
}
