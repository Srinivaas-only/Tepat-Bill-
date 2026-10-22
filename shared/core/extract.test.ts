import { describe, it, expect } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { APICallError } from 'ai';
import { extractWithFallback, makeGemini, linesToSen, cacheKey } from './extract';

const canned = { docType: 'invoice', supplierName: 'Syarikat Ali', docNo: 'INV-1', currency: 'MYR', lines: [{ description: 'Beras 10kg', qty: 10, unitPrice: '45.00', box_2d: [100, 50, 140, 900] }] };
const ok = (doc: unknown = canned) => new MockLanguageModelV4({ doGenerate: async () => ({
  content: [{ type: 'text', text: JSON.stringify(doc) }],
  finishReason: { unified: 'stop', raw: undefined },
  usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
  warnings: [] }) });
const failing = (statusCode: number) => new MockLanguageModelV4({ doGenerate: async () => {
  throw new APICallError({ message: 'Resource has been exhausted (e.g. check quota).', url: 'https://generativelanguage.googleapis.com/v1beta/models/x:generateContent',
    requestBodyValues: {}, statusCode, responseHeaders: { 'retry-after': '30' },
    responseBody: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}', isRetryable: statusCode === 429 || statusCode >= 500 });
} });
const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

describe('extractWithFallback (offline)', () => {
  it('primary succeeds', async () => {
    const p = ok(), f = ok();
    const r = await extractWithFallback(p, f, bytes, 'image/jpeg');
    expect(r).toMatchObject({ ok: true, model: 'primary' });
    expect(f.doGenerateCalls).toHaveLength(0);
    if (r.ok) expect(linesToSen(r.doc)[0]).toMatchObject({ lineId: 'L1', unitPriceSen: 4500, box: [100, 50, 140, 900] });
  });
  it('primary 429 -> fallback', async () => {
    const p = failing(429), f = ok();
    const r = await extractWithFallback(p, f, bytes, 'image/jpeg');
    expect(r).toMatchObject({ ok: true, model: 'fallback' });
    expect(p.doGenerateCalls).toHaveLength(1); // maxRetries:0 -> no internal retry
    expect(f.doGenerateCalls).toHaveLength(1);
  });
  it('primary 503 -> fallback 429 -> needsManualEntry', async () => {
    const r = await extractWithFallback(failing(503), failing(429), bytes, 'image/jpeg');
    expect(r).toMatchObject({ ok: false, needsManualEntry: true });
  });
  it('primary 400 -> manual entry without burning fallback', async () => {
    const f = ok();
    const r = await extractWithFallback(failing(400), f, bytes, 'image/jpeg');
    expect(r).toMatchObject({ needsManualEntry: true }); expect(f.doGenerateCalls).toHaveLength(0);
  });
  it('schema-invalid (2.5 qty) -> manual entry', async () => {
    const r = await extractWithFallback(ok({ ...canned, lines: [{ ...canned.lines[0], qty: 2.5 }] }), ok(), bytes, 'image/jpeg');
    expect(r).toMatchObject({ needsManualEntry: true });
  });
  it('PDF file part reaches the mock prompt intact; providerOptions forwarded', async () => {
    const p = ok();
    await extractWithFallback(p, ok(), bytes, 'application/pdf');
    const call = p.doGenerateCalls[0];
    const user = call.prompt.find(m => m.role === 'user')!;
    const file = (user.content as Array<{ type: string }>).find(c => c.type === 'file') as any;
    expect(file.mediaType).toBe('application/pdf');
    const data = file.data?.type === 'data' ? file.data.data : file.data;
    expect(Array.from(data as Uint8Array)).toEqual(Array.from(bytes));
    expect(call.providerOptions?.google).toEqual({ thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_HIGH' });
    expect(call.responseFormat?.type).toBe('json');
  });
  it('PO lines without prices stay undefined (owner fills them in)', () => {
    expect(linesToSen({ docType: 'purchase_order', supplierName: 'x', lines: [{ description: 'Milo', qty: 5 }] })[0].unitPriceSen).toBeUndefined();
  });
  it('cache key is a stable sha256 of the bytes', () => {
    expect(cacheKey(bytes)).toBe(cacheKey(new Uint8Array(bytes))); expect(cacheKey(bytes)).toHaveLength(64);
  });
  it('real gemini models construct without a key', () => {
    const { primary, fallback } = makeGemini('dummy');
    expect([primary.modelId, fallback.modelId]).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  });
});
