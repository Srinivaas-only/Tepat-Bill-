// Call-site workaround for shared/core/extract.ts (read-only): its ExtractedDoc uses z.tuple for box_2d, which serialises to
// JSON-schema `items: [...]` that Gemini rejects with 400 ("items must be a boolean or an object"), so every real read failed.
// Same prompt, options, models, fallback rules and result shape as core; only the wire schema differs (array of 4 ints).
import { generateText, Output, APICallError, RetryError, type LanguageModel } from 'ai';
import { z } from 'zod';
import { EXTRACTION_PROMPT, ExtractedDoc, geminiOptions, type ExtractResult } from '../shared/core/extract';

const Money = z.string().regex(/^\d+(\.\d{1,2})?$/);
const WireDoc = z.object({
  docType: z.enum(['purchase_order', 'invoice', 'delivery_note', 'other']),
  supplierName: z.string(),
  docNo: z.string().optional(),
  docDate: z.string().optional(),
  currency: z.string().optional(),
  supplierCountry: z.string().optional(),
  totalAmount: Money.optional(),
  lines: z.array(z.object({
    description: z.string(),
    qty: z.number().int().nonnegative(),
    unit: z.string().optional(),
    unitPrice: Money.optional(),
    lineTotal: Money.optional(),
    box_2d: z.array(z.number().int()).optional(),
  })),
});

function shouldFallback(e: unknown): boolean {
  const inner = RetryError.isInstance(e) ? e.lastError : e;
  const c = APICallError.isInstance(inner) ? inner.statusCode : undefined;
  return c !== undefined && (c === 429 || c === 404 || c >= 500);
}

async function once(model: LanguageModel, bytes: Uint8Array, mediaType: string): Promise<ExtractedDoc> {
  const { output } = await generateText({
    model, maxRetries: 0, providerOptions: geminiOptions, output: Output.object({ schema: WireDoc }),
    messages: [{ role: 'user', content: [{ type: 'text', text: EXTRACTION_PROMPT }, { type: 'file', mediaType, data: bytes }] }],
  });
  const lines = output.lines.map(l => {
    const { box_2d, ...rest } = l;
    return box_2d && box_2d.length === 4 ? { ...rest, box_2d: box_2d as [number, number, number, number] } : rest;
  });
  return ExtractedDoc.parse({ ...output, lines });
}

export async function readDocument(primary: LanguageModel, fallback: LanguageModel, bytes: Uint8Array, mediaType: string): Promise<ExtractResult> {
  try {
    return { ok: true, model: 'primary', doc: await once(primary, bytes, mediaType) };
  } catch (e) {
    if (!shouldFallback(e)) return { ok: false, needsManualEntry: true, reason: `primary: ${(e as Error).name}` };
    try {
      return { ok: true, model: 'fallback', doc: await once(fallback, bytes, mediaType) };
    } catch (e2) {
      return { ok: false, needsManualEntry: true, reason: `fallback: ${(e2 as Error).name}` };
    }
  }
}
