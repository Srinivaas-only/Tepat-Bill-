import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { motion } from 'motion/react';
import { useI18n } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { BottomNav } from '@/components/bottom-nav';
import { openIntro, useIntroOpen } from '@/lib/intro';
import { Skeleton } from '@/components/ui/skeleton';

/** Reload once when a lazy chunk fails to load (e.g. after a redeploy). */
function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().catch(err => {
    if (!sessionStorage.getItem('tb_chunk_reload')) { sessionStorage.setItem('tb_chunk_reload', '1'); location.reload(); return new Promise<{ default: T }>(() => undefined); }
    throw err;
  }));
}
const Intro = lazyRetry(() => import('@/components/intro'));
const Login = lazyRetry(() => import('@/pages/login'));
const Home = lazyRetry(() => import('@/pages/home'));
const Flags = lazyRetry(() => import('@/pages/flags'));
const Suppliers = lazyRetry(() => import('@/pages/suppliers'));
const Scan = lazyRetry(() => import('@/pages/scan'));
const More = lazyRetry(() => import('@/pages/more'));
const Read = lazyRetry(() => import('@/pages/read'));
const Review = lazyRetry(() => import('@/pages/review'));
const Orders = lazyRetry(() => import('@/pages/orders'));
const Count = lazyRetry(() => import('@/pages/count'));
const Bon = lazyRetry(() => import('@/pages/bon'));
const FlagDetail = lazyRetry(() => import('@/pages/flag-detail'));
const Evidence = lazyRetry(() => import('@/pages/evidence'));
const SupplierDetail = lazyRetry(() => import('@/pages/supplier-detail'));
const Activity = lazyRetry(() => import('@/pages/activity'));
const InvoiceDetail = lazyRetry(() => import('@/pages/invoice-detail'));
const EInvoice = lazyRetry(() => import('@/pages/einvoice'));
const Settings = lazyRetry(() => import('@/pages/settings'));
const Compare = lazyRetry(() => import('@/pages/compare'));
const OrderPo = lazyRetry(() => import('@/pages/order-po'));

const Fallback = () => <div className="space-y-3 p-5"><Skeleton className="h-8 w-40" /><Skeleton className="h-44 w-full" /></div>;

function NavGate() {
  const [loc] = useLocation();
  return /^\/(read|review|bon)\b/.test(loc) || /^\/invoices\/[^/]+\/(count|compare)/.test(loc) || /^\/deliveries\/[^/]+\/count/.test(loc) || /^\/flags\/[^/]+/.test(loc) ? null : <BottomNav />;
}

function OfflineBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online ? null : <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[70]"><div className="mx-auto max-w-[480px] border-b border-line bg-surface-3 px-4 pb-2 pt-[calc(8px+var(--safe-top))] text-center text-sm font-medium text-ink">{t('common.offline')}</div></div>;
}

/** Deeper screens slide in from the right, going back slides in from the left, sibling tabs just rise. */
const depth = (p: string) => p.split('/').filter(Boolean).length;

function AppShell() {
  const { role, loading } = useAuth();
  const [loc] = useLocation();
  const introOpen = useIntroOpen();
  const nav = useRef({ loc, dir: 0 });
  if (nav.current.loc !== loc) nav.current = { loc, dir: Math.sign(depth(loc) - depth(nav.current.loc)) };
  const dx = nav.current.dir * 28;
  useEffect(() => { if (role) openIntro(); }, [role]);   // a short how-to after every login
  if (loading) return <Fallback />;
  if (!role) return <><div className="ambient" aria-hidden /><div className="aurora" aria-hidden /><div className="grain" aria-hidden /><Suspense fallback={<Fallback />}><Login /></Suspense></>;
  return (
    <div className="mx-auto min-h-dvh max-w-[480px] pb-28 md:bg-bg md:shadow-[0_0_0_1px_rgb(255_255_255/.08),0_40px_100px_-30px_rgb(0_0_0/.9)]">
      <div className="ambient" aria-hidden /><div className="aurora" aria-hidden /><div className="grain" aria-hidden />
      <OfflineBanner />
      <Suspense fallback={<Fallback />}>
        <motion.div key={loc} initial={{ opacity: 0, x: dx, y: dx ? 0 : 8 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
        <Switch>
          <Route path="/login"><Redirect to="/" /></Route>
          <Route path="/" component={Home} />
          <Route path="/flags" component={Flags} />
          <Route path="/flags/:id" component={FlagDetail} />
          <Route path="/suppliers" component={Suppliers} />
          <Route path="/suppliers/:id" component={SupplierDetail} />
          <Route path="/scan" component={Scan} />
          <Route path="/read/:id" component={Read} />
          <Route path="/review/:kind/:id" component={Review} />
          <Route path="/invoices/:id/count">{() => <Count />}</Route>
          <Route path="/invoices/:id/compare" component={Compare} />
          <Route path="/deliveries/:id/count">{() => <Count mode="delivery" />}</Route>
          <Route path="/orders/po/:id" component={OrderPo} />
          <Route path="/invoices/:id/einvoice" component={EInvoice} />
          <Route path="/invoices/:id" component={InvoiceDetail} />
          <Route path="/bon/:docId" component={Bon} />
          <Route path="/orders" component={Orders} />
          <Route path="/activity" component={Activity} />
          <Route path="/more" component={More} />
          <Route path="/settings" component={Settings} />
          <Route><More /></Route>
        </Switch>
        </motion.div>
      </Suspense>
      <NavGate />
      {introOpen && <Suspense fallback={null}><Intro /></Suspense>}
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
