import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { cacheKey } from '../../shared/core/extract';
import * as S from '../../shared/schema';
import type { AppDeps } from '../app';
import { ApiError } from '../app';
import { requireAuth } from '../auth';
import { logEvent } from '../events';
import { docExt } from '../storage';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

const Body = z.object({
  kind: z.enum(['po', 'invoice', 'delivery_note', 'photo']),
  photoKind: z.enum(['invoice', 'po', 'signed_bon', 'delivery']).optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  pageCount: z.coerce.number().int().positive().optional(),
  invoiceId: z.string().optional(),
});

export function documentsRouter(deps: AppDeps) {
  const r = Router();
  r.use('/documents', requireAuth);

  r.post('/documents', upload.single('file'), async (req, res) => {
    if (!req.file) throw new ApiError(400, 'bad_request', 'Tiada fail');
    if (!ALLOWED.has(req.file.mimetype)) throw new ApiError(422, 'unsupported_type', 'Jenis fail tidak disokong');
    const b0 = req.file.buffer;
    const magicOk = req.file.mimetype === 'image/png' ? b0.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      : req.file.mimetype === 'image/jpeg' ? b0.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      : b0.subarray(0, 4).toString('latin1') === 'RIFF' && b0.subarray(8, 12).toString('latin1') === 'WEBP';
    if (!magicOk) throw new ApiError(415, 'unsupported_type', 'Fail bukan imej yang sah');
    const body = Body.safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'Data tidak sah');
    const sha256 = cacheKey(req.file.buffer);
    const key = `docs/${sha256}.${docExt(req.file.mimetype)}`;
    if (!(await deps.storage.exists(key))) await deps.storage.put(key, req.file.buffer);
    const id = `doc_${nanoid(10)}`;
    await deps.db.insert(S.documents).values({
      id, kind: body.data.kind, photoKind: body.data.photoKind ?? null, storageKey: key, mime: req.file.mimetype, sha256,
      width: body.data.width ?? null, height: body.data.height ?? null, pageCount: body.data.pageCount ?? 1,
      invoiceId: body.data.invoiceId ?? null, uploadedByRole: req.role!,
    });
    await logEvent(deps.db, req.role!, 'document.upload', id, { kind: body.data.kind });
    res.status(201).json({ id, sha256, width: body.data.width ?? null, height: body.data.height ?? null });
  });

  r.get('/documents/:id/file', async (req, res) => {
    const [doc] = await deps.db.select().from(S.documents).where(eq(S.documents.id, String(req.params.id)));
    if (!doc) throw new ApiError(404, 'not_found', 'Dokumen tiada');
    const stream = await deps.storage.stream(doc.storageKey);
    if (!stream) throw new ApiError(404, 'not_found', 'Fail tiada');
    res.set({ 'Content-Type': doc.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });

  r.get('/documents/:id', async (req, res) => {
    const [doc] = await deps.db.select().from(S.documents).where(eq(S.documents.id, String(req.params.id)));
    if (!doc) throw new ApiError(404, 'not_found', 'Dokumen tiada');
    res.json({ id: doc.id, kind: doc.kind, width: doc.width, height: doc.height, pageCount: doc.pageCount, sha256: doc.sha256 });
  });
  return r;
}
