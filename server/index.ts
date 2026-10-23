import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
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

async function main() {
  assertProductionConfig();
  const { db } = getDb();
  const storage = makeStorage();
  if (process.env.SEED_ON_BOOT === '1') await seedIfEmpty(db, storage);

  const app = createApp({ db, storage });
  const server = http.createServer(app);
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
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  const port = Number(process.env.PORT ?? 5000);
  server.listen(port, '0.0.0.0', () => console.log(`[server] listening on :${port} (${isProd ? 'production' : 'development'})`));
}

main().catch(e => { console.error(e); process.exit(1); });
