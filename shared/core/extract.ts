// Gemini document reader (server-side only). AI READS; it never computes flags or money.
// Primary gemini-3.8-flash -> fallback gemini-3.5-flash-lite on 429/5xx -> manual entry. maxRetries: 0 so we control fallback.
import { generateText, Output, APICallError, RetryError, type LanguageModel } from 'ai';
import { createGoogle, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parseRM } from './rules';

export const MODELS = { primary: 'gemini-3.8-flash', fallback: 'gemini-3.5-flash-lite' } as const;

const Money = z.string().regex(/^\d+(\.\d{1,2})?$/); // "45.00": AI returns strings; parseRM converts to integer sen
const Box = z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int()]); // [ymin,xmin,ymax,xmax] 0-1000
/** Keep this schema FLAT: deep/large schemas make Gemini return 400 "invalid argument". */
export const ExtractedDoc = z.object({
  docType: z.enum(['purchase_order', 'invoice', 'delivery_note', 'other']),
  supplierName: z.string(),
  docNo: z.string().optional(),
  docDate: z.string().optional(),          // YYYY-MM-DD
  currency: z.string().optional(),         // ISO 4217, e.g. MYR, USD
  supplierCountry: z.string().optional(),  // ISO 3166 alpha-2, e.g. MY, CN
  totalAmount: Money.optional(),
  lines: z.array(z.object({
    description: z.string(),
    qty: z.number().int().nonnegative(),
    unit: z.string().optional(),           // ctn, pek, kg, tin...
    unitPrice: Money.optional(),           // POs often have no price
    lineTotal: Money.optional(),
    box_2d: Box.optional(),
  })),
});
export type ExtractedDoc = z.infer<typeof ExtractedDoc>;

export const EXTRACTION_PROMPT = `You read Malaysian shop documents: handwritten order notes, supplier invoices, delivery orders (bon) and WhatsApp screenshots. Text may be Bahasa Malaysia, English or Chinese, printed or handwritten.
Return every item line exactly as written. Rules:
- docType: purchase_order for the shop's own order/notebook/WhatsApp order; invoice for a supplier invoice/bill; delivery_note for a DO/bon without prices.
- qty: the integer quantity on that line (cartons/packs/units as written). Never invent or compute quantities.
- unitPrice, lineTotal, totalAmount: digits only with 2 decimals, e.g. "45.00". Omit if not written. Never calculate a missing price.
- currency: ISO code if shown (RM => MYR). supplierCountry: ISO alpha-2 if an address shows it.
- docDate as YYYY-MM-DD.
- box_2d: bounding box of the WHOLE line row as [ymin, xmin, ymax, xmax] normalised 0-1000.
- If a value is unreadable, omit it rather than guess.`;

/** Lazy: no key read until a call is made. */
export const makeGemini = (apiKey?: string) => {
  const google = createGoogle({ apiKey });
  return { primary: google(MODELS.primary), fallback: google(MODELS.fallback) };
};
export const geminiOptions = {
  google: { thinkingConfig: { thinkingLevel: 'low' }, mediaResolution: 'MEDIA_RESOLUTION_HIGH' } satisfies GoogleLanguageModelOptions,
};

/** Cache key: same bytes -> same read, zero extra Gemini requests (spec). */
export const cacheKey = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function quotaOrServer(e: unknown): boolean {
  const inner = RetryError.isInstance(e) ? e.lastError : e;
  return APICallError.isInstance(inner) && inner.statusCode !== undefined && (inner.statusCode === 429 || inner.statusCode >= 500);
}

async function extractOnce(model: LanguageModel, bytes: Uint8Array, mediaType: string) {
  const { output } = await generateText({
    model, maxRetries: 0, providerOptions: geminiOptions,
    output: Output.object({ schema: ExtractedDoc }),
    messages: [{ role: 'user', content: [
      { type: 'text', text: EXTRACTION_PROMPT },
      { type: 'file', mediaType, data: bytes },
    ] }],
  });
  return output;
}

export type ExtractResult =
  | { ok: true; model: 'primary' | 'fallback'; doc: ExtractedDoc }
  | { ok: false; needsManualEntry: true; reason: string };

export async function extractWithFallback(primary: LanguageModel, fallback: LanguageModel, bytes: Uint8Array, mediaType: string): Promise<ExtractResult> {
  try {
    return { ok: true, model: 'primary', doc: await extractOnce(primary, bytes, mediaType) };
  } catch (e) {
    if (!quotaOrServer(e)) return { ok: false, needsManualEntry: true, reason: `primary: ${(e as Error).name}` };
    try {
      return { ok: true, model: 'fallback', doc: await extractOnce(fallback, bytes, mediaType) };
    } catch (e2) {
      return { ok: false, needsManualEntry: true, reason: `fallback: ${(e2 as Error).name}` };
    }
  }
}

/** Convert AI strings to integer sen. Missing prices stay undefined (owner fills them in the correct-extraction screen). */
export const linesToSen = (doc: ExtractedDoc) => doc.lines.map((l, i) => ({
  lineId: `L${i + 1}`, description: l.description, qty: l.qty, unit: l.unit,
  unitPriceSen: l.unitPrice === undefined ? undefined : parseRM(l.unitPrice),
  box: l.box_2d,
}));
