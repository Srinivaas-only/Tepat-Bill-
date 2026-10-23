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

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    await deps.db.execute(sql`select 1`);
    res.json({ ok: true });
  });

  app.use('/e', (_req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
  app.use('/api', evidenceRouter(deps));
  app.use('/api', authRouter(deps));
  app.use('/api', documentsRouter(deps));
  app.use('/api', extractRouter(deps));
  app.use('/api', ordersRouter(deps));
  app.use('/api', countsRouter(deps));
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
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
      return;
    }
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'MulterError') {
      res.status(413).json({ error: { code: 'too_large', message: 'Fail terlalu besar' } });
      return;
    }
    console.error('[error]', err);
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
  });
}
