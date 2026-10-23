import { Router } from 'express';
import { z } from 'zod';
import { APICallError, generateText, wrapLanguageModel, type LanguageModel } from 'ai';
import { eq, sql } from 'drizzle-orm';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cacheKey, extractWithFallback, makeGemini, MODELS, type ExtractedDoc, type ExtractResult } from '../../shared/core/extract';
import * as S from '../../shared/schema';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth, requireCan } from '../auth';
import { logEvent } from '../events';

const envTimeout = Number(process.env.EXTRACT_TIMEOUT_MS ?? 38_000);
const EXTRACT_TIMEOUT_MS = Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 38_000;

/** Per-model time budget: a slow primary is cut off (retryable 504) so the fallback still gets its turn inside the overall timeout. */
const budget = (m: LanguageModel, ms: number): LanguageModel => wrapLanguageModel({
  model: m as Parameters<typeof wrapLanguageModel>[0]['model'],
  middleware: {
    wrapGenerate: async ({ doGenerate }) => {
      let t: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([doGenerate(), new Promise<never>((_, rej) => {
          t = setTimeout(() => rej(new APICallError({ message: 'timeout', url: 'gemini', requestBodyValues: {}, statusCode: 504, isRetryable: true })), ms);
        })]);
      } finally { clearTimeout(t); }
    },
  },
});
/** One Gemini call per file even when the same bytes are extracted concurrently. */
const inflight = new Map<string, Promise<ExtractResult | { ok: false; needsManualEntry: true; reason: string }>>();
const DOC_TYPE: Record<string, ExtractedDoc['docType']> = { po: 'purchase_order', invoice: 'invoice', delivery_note: 'delivery_note' };
const fixturesDir = () => path.resolve(process.cwd(), 'fixtures', 'docs');
const demoOn = () => process.env.DEMO_FIXTURES === '1';

/** Boxes are only trusted from the primary model / fixtures. Flash-Lite and manual reads store box = null. */
const stripBoxes = (doc: ExtractedDoc): ExtractedDoc => ({ ...doc, lines: doc.lines.map(({ box_2d: _b, ...l }) => l) });
const view = (model: string, doc: ExtractedDoc) => (model === MODELS.fallback || model === 'manual' ? stripBoxes(doc) : doc);

function listFixtures(docType?: string) {
  return readdirSync(fixturesDir()).filter(f => f.endsWith('.expected.json')).map(f => {
    const name = f.replace('.expected.json', '');
    const doc = JSON.parse(readFileSync(path.join(fixturesDir(), f), 'utf8')) as ExtractedDoc;
    return { name, docType: doc.docType, supplierName: doc.supplierName, docNo: doc.docNo ?? null };
  }).filter(f => !docType || f.docType === docType);
}

export function extractRouter(deps: AppDeps) {
  const r = Router();
  r.use(['/documents', '/fixtures'], requireAuth);

  const getDoc = async (id: string) => {
    const [doc] = await deps.db.select().from(S.documents).where(eq(S.documents.id, id));
    if (!doc) throw new ApiError(404, 'not_found', 'Dokumen tiada');
    return doc;
  };

  /** Writes the read to the cache and decrements checks_left once (also for a late result after the 45s timeout). */
  const record = async (sha256: string, model: string, doc: ExtractedDoc, ref: string, role: 'owner' | 'staff') => {
    const ins = await deps.db.insert(S.extractions).values({ sha256, model, doc }).onConflictDoNothing().returning({ sha: S.extractions.sha256 });
    if (ins.length) {
      await deps.db.execute(sql`update settings set value = to_jsonb(greatest((value #>> '{}')::int - 1, 0)) where key = 'checks_left'`);
      await logEvent(deps.db, role, 'ai.read', ref, { model });
    }
  };

  /** Demo-morning check: one tiny text call per model. Touches neither the extractions cache, checks_left nor the events log. */
  let lastCheckAt = 0;
  r.post('/gemini-check', requireAuth, requireCan('edit_supplier'), async (_req, res) => {
    if (!process.env.GEMINI_API_KEY && !deps.gemini) { res.json({ ok: false, error: 'GEMINI_API_KEY not set' }); return; }
    const now = Date.now();
    if (now - lastCheckAt < 10_000) throw new ApiError(429, 'rate_limited', 'Cuba lagi sebentar');
    lastCheckAt = now;
    let models;
    try { models = deps.gemini ? deps.gemini() : makeGemini(process.env.GEMINI_API_KEY); }
    catch { res.json({ ok: false, error: 'Gemini setup failed' }); return; }
    const probe = async (name: string, model: LanguageModel) => {
      const t0 = Date.now();
      try {
        await generateText({ model: budget(model, 10_000), prompt: 'ping', maxOutputTokens: 16, maxRetries: 0 });
        return { model: name, ok: true, ms: Date.now() - t0 };
      } catch (e) {
        const status = APICallError.isInstance(e) ? e.statusCode : undefined;
        return { model: name, ok: false, ms: Date.now() - t0, error: status ? `HTTP ${status}` : (e instanceof Error ? e.name : 'error').slice(0, 80) };
      }
    };
    const [primary, fallback] = await Promise.all([probe(MODELS.primary, models.primary), probe(MODELS.fallback, models.fallback)]);
    res.json({ ok: primary.ok && fallback.ok, primary, fallback });
  });

  r.post('/documents/:id/extract', async (req, res) => {
    const doc = await getDoc(String(req.params.id));
    const [cached] = await deps.db.select().from(S.extractions).where(eq(S.extractions.sha256, doc.sha256));
    if (cached) { console.log('[extract]', { ms: 0, model: cached.model, ok: true, cached: true }); res.json({ status: 'ok', model: cached.model, cached: true, doc: view(cached.model, cached.doc as ExtractedDoc) }); return; }

    const bytes = await deps.storage.get(doc.storageKey);
    if (!bytes) throw new ApiError(404, 'not_found', 'Fail tiada');
    const role = req.role!;
    const existing = inflight.get(doc.sha256);
    const work = existing ?? (async () => {
      let models;
      try { models = deps.gemini ? deps.gemini() : makeGemini(process.env.GEMINI_API_KEY); }
      catch (e) { return { ok: false as const, needsManualEntry: true as const, reason: `setup: ${(e as Error).name}` }; }
      const t0 = Date.now();
      const out = await extractWithFallback(budget(models.primary, 20_000), budget(models.fallback, 15_000), bytes, doc.mime);
      console.log('[extract]', { ms: Date.now() - t0, model: out.ok ? MODELS[out.model] : null, ok: out.ok, cached: false });
      if (out.ok) await record(doc.sha256, MODELS[out.model], out.doc, doc.id, role);
      return out;
    })();
    if (!existing) { inflight.set(doc.sha256, work); void work.finally(() => inflight.delete(doc.sha256)).catch(() => {}); }
    work.catch(e => console.error('[extract] late failure', e));
    const timeout = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), EXTRACT_TIMEOUT_MS).unref?.());
    const out = await Promise.race([work, timeout]);
    if (out === 'timeout') { res.json({ status: 'manual', reason: 'timeout' }); return; }
    if (!out.ok) { res.json({ status: 'manual', reason: out.reason }); return; }
    res.json({ status: 'ok', model: MODELS[out.model], cached: false, doc: view(MODELS[out.model], out.doc) });
  });

  r.get('/fixtures', (req, res) => {
    if (!demoOn()) throw new ApiError(404, 'not_found', 'Not found');
    res.json({ fixtures: listFixtures(typeof req.query.docType === 'string' ? req.query.docType : undefined) });
  });

  r.post('/documents/:id/use-fixture', async (req, res) => {
    if (!demoOn()) throw new ApiError(404, 'not_found', 'Not found');
    const body = z.object({ fixture: z.string() }).safeParse(req.body);
    const name = body.success ? listFixtures().find(f => f.name === body.data.fixture)?.name : undefined;
    if (!name) throw new ApiError(400, 'bad_request', 'Fixture tidak sah');
    const doc = await getDoc(String(req.params.id));
    const [usedInv] = await deps.db.select({ id: S.invoices.id }).from(S.invoices).where(eq(S.invoices.documentId, doc.id));
    const [usedPo] = await deps.db.select({ id: S.purchaseOrders.id }).from(S.purchaseOrders).where(eq(S.purchaseOrders.documentId, doc.id));
    const [usedDel] = await deps.db.select({ id: S.deliveries.id }).from(S.deliveries).where(eq(S.deliveries.documentId, doc.id));
    if (usedInv || usedPo || usedDel || doc.invoiceId || doc.deliveryId) throw new ApiError(409, 'document_in_use', 'Dokumen ini sudah digunakan');
    const want = DOC_TYPE[doc.kind];
    const expected = JSON.parse(readFileSync(path.join(fixturesDir(), `${name}.expected.json`), 'utf8')) as ExtractedDoc;
    if (want && expected.docType !== want) throw new ApiError(422, 'wrong_type', 'Jenis dokumen tidak sepadan');
    const bytes = readFileSync(path.join(fixturesDir(), `${name}.png`));
    const sha = cacheKey(bytes);
    const key = `docs/${sha}.png`;
    if (!(await deps.storage.exists(key))) await deps.storage.put(key, bytes);
    await deps.db.insert(S.extractions).values({ sha256: sha, model: 'fixture', doc: expected }).onConflictDoNothing();
    await deps.db.update(S.documents).set({ storageKey: key, sha256: sha, mime: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), pageCount: 1 })
      .where(eq(S.documents.id, doc.id));
    await logEvent(deps.db, req.role!, 'ai.fixture', doc.id, { fixture: name });
    res.json({ status: 'ok', model: 'fixture', cached: true, doc: expected });
  });
  return r;
}
