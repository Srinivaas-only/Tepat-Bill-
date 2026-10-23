import { lazy, Suspense } from 'react';
import { Route, Switch, useLocation } from 'wouter';
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

function AppShell() {
  const { role, loading } = useAuth();
  if (loading) return <Fallback />;
  if (!role) return <Suspense fallback={<Fallback />}><Login /></Suspense>;
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] pb-24">
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
