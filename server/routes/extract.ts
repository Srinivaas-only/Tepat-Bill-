import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cacheKey, makeGemini, MODELS, type ExtractedDoc } from '../../shared/core/extract';
import * as S from '../../shared/schema';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth } from '../auth';
import { logEvent } from '../events';
import { readDocument } from '../gemini';

const EXTRACT_TIMEOUT_MS = Number(process.env.EXTRACT_TIMEOUT_MS ?? 45_000);
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

  r.post('/documents/:id/extract', async (req, res) => {
    const doc = await getDoc(String(req.params.id));
    const [cached] = await deps.db.select().from(S.extractions).where(eq(S.extractions.sha256, doc.sha256));
    if (cached) { res.json({ status: 'ok', model: cached.model, cached: true, doc: view(cached.model, cached.doc as ExtractedDoc) }); return; }

    const bytes = await deps.storage.get(doc.storageKey);
    if (!bytes) throw new ApiError(404, 'not_found', 'Fail tiada');
    const role = req.role!;
    const work = (async () => {
      let models;
      try { models = deps.gemini ? deps.gemini() : makeGemini(process.env.GEMINI_API_KEY); }
      catch (e) { return { ok: false as const, needsManualEntry: true as const, reason: `setup: ${(e as Error).name}` }; }
      const out = await readDocument(models.primary, models.fallback, bytes, doc.mime);
      if (out.ok) await record(doc.sha256, MODELS[out.model], out.doc, doc.id, role);
      return out;
    })();
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
