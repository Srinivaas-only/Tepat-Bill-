import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import type { Db } from './db';
import type { Storage } from './storage';
import type { LanguageModel } from 'ai';
import { sql } from 'drizzle-orm';
import { authRouter } from './routes/auth';
import { documentsRouter } from './routes/documents';
import { extractRouter } from './routes/extract';
import { ordersRouter } from './routes/orders';
import { countsRouter } from './routes/counts';
import { flagActionsRouter } from './routes/flag-actions';
import { messagesRouter } from './routes/messages';
import { evidenceRouter } from './routes/evidence';
import { moneyRouter } from './routes/money';
import { homeRouter } from './routes/home';
import { extrasRouter } from './routes/extras';
import { deliveriesRouter } from './routes/deliveries';
import { stubRouter } from './routes/stubs';

export interface GeminiLike { primary: LanguageModel; fallback: LanguageModel }
export interface AppDeps {
  db: Db;
  storage: Storage;
  /** Injected so tests can pass a stub that throws if called. */
  gemini?: () => GeminiLike;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) { super(message); }
}

export function createApp(deps: AppDeps, early: express.RequestHandler[] = []): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  for (const m of early) app.use(m);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    const base = { storage: deps.storage.driver, gemini: !!process.env.GEMINI_API_KEY, demo: process.env.DEMO_FIXTURES === '1' };
    try {
      const r = await deps.db.execute(sql`select count(*)::int as n from suppliers`);
      await deps.storage.exists('__health__').catch(() => false); // lets the lazy storage pick its driver
      const n = Number((r as unknown as { rows?: { n: number }[] }).rows?.[0]?.n ?? 0);
      res.json({ ok: true, db: true, ...base, storage: deps.storage.driver, seeded: n > 0 });
    } catch (e) {
      console.error('[health] db ping failed', e instanceof Error ? e.message : e);
      res.status(503).json({ ok: false, db: false, ...base, seeded: false });
    }
  });

  // CSRF: browsers send Origin on cross-site writes; reject when it is not our host (or the fetch metadata says cross-site).
  app.use('/api', (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') { next(); return; }
    const origin = req.get('origin');
    let bad = req.get('sec-fetch-site') === 'cross-site';
    if (origin && !bad) {
      const hosts = [req.get('host'), req.get('x-forwarded-host')?.split(',')[0].trim()].filter(Boolean);
      try { bad = !hosts.includes(new URL(origin).host); } catch { bad = true; }
    }
    if (bad) { next(new ApiError(403, 'forbidden', 'Permintaan ditolak')); return; }
    next();
  });

  app.use('/e', (_req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
  app.use('/api', evidenceRouter(deps));
  app.use('/api', authRouter(deps));
  app.use('/api', documentsRouter(deps));
  app.use('/api', extractRouter(deps));
  app.use('/api', ordersRouter(deps));
  app.use('/api', countsRouter(deps));
  app.use('/api', deliveriesRouter(deps));
  app.use('/api', messagesRouter(deps));
  app.use('/api', moneyRouter(deps));
  app.use('/api', homeRouter(deps));
  app.use('/api', extrasRouter(deps));
  app.use('/api', flagActionsRouter(deps));
  return app;
}

/** Final handlers: /api JSON 404 and the JSON error handler. Mounted after all routers. */
export function mountErrorHandlers(app: Express) {
  app.use('/api', stubRouter());
  app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }); });
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) { next(err); return; }
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
      return;
    }
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'MulterError') {
      if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') res.status(413).json({ error: { code: 'too_large', message: 'Fail terlalu besar' } });
      else res.status(400).json({ error: { code: 'bad_request', message: 'Muat naik tidak sah' } });
      return;
    }
    const st = (err as { status?: number; statusCode?: number } | null)?.status ?? (err as { statusCode?: number } | null)?.statusCode;
    if (typeof st === 'number' && st >= 400 && st <= 499) {
      res.status(st).json({ error: { code: 'bad_request', message: 'Permintaan tidak sah' } });
      return;
    }
    console.error('[error]', err);
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
  });
}
