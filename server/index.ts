import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import compression from 'compression';
import { createApp, mountErrorHandlers } from './app';
import { getDb } from './db';
import { makeStorage } from './storage';
import { seedIfEmpty } from './seed';
import { getPins } from './auth';

function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) { console.error('[config] SESSION_SECRET must be set and at least 32 characters in production'); process.exit(1); }
  try { getPins(); } catch (e) { console.error(`[config] ${(e as Error).message}`); process.exit(1); }
}

function logPinState() {
  const ok = (k: string) => /^\d{4}$/.test(process.env[k] ?? '');
  console.log(`[config] OWNER_PIN ${ok('OWNER_PIN') ? 'is' : 'is NOT'} 4 digits; STAFF_PIN ${ok('STAFF_PIN') ? 'is' : 'is NOT'} 4 digits`);
}

async function main() {
  assertProductionConfig();
  logPinState();
  const { db } = getDb();
  const storage = makeStorage();
  if (process.env.SEED_ON_BOOT === '1') {
    try { await seedIfEmpty(db, storage); } catch (e) { console.error('[seed] failed, continuing without it:', (e as Error).message); }
  }
  for (const k of ['GEMINI_API_KEY', 'DEMO_FIXTURES', 'PUBLIC_BASE_URL']) if (!process.env[k]) console.warn(`[config] ${k} is not set`);

  const app = createApp({ db, storage }, [compression()]);
  const server = http.createServer(app);
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  const isProd = process.env.NODE_ENV === 'production';
  const root = process.cwd();

  mountErrorHandlers(app);

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'custom' });
    app.use(vite.middlewares);
    app.get('/{*splat}', async (req, res, next) => {
      try {
        const html = await vite.transformIndexHtml(req.originalUrl, fs.readFileSync(path.join(root, 'client/index.html'), 'utf8'));
        res.status(200).set({ 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html);
      } catch (e) { vite.ssrFixStacktrace(e as Error); next(e); }
    });
  } else {
    const dist = path.join(root, 'dist/public');
    app.use((_req, res, next) => {
      res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-hashes' 'sha256-MhtPZXr7+LpJUY5qtMutB+qWfQtMaPccfe7QXtCcEYc='; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'");
      next();
    });
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
    app.use(express.static(dist, { index: false, maxAge: 0 }));
    app.get('/{*splat}', (req, res) => {
      if (/\.[a-z0-9]+$/i.test(req.path)) { res.status(404).end(); return; }
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  const port = Number(process.env.PORT ?? 5000);
  server.listen(port, '0.0.0.0', () => console.log(`[server] listening on :${port} (${isProd ? 'production' : 'development'})`));
}

main().catch(e => { console.error(e); process.exit(1); });
