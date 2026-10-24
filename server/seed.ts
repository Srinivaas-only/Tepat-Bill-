// Seed: truncates every table (except the extractions read cache) and loads fixtures/seed.json (relative daysAgo times). Idempotent.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from './db';
import { makeDb } from './db';
import { makeStorage, type Storage } from './storage';
import * as S from '../shared/schema';
import { ALL_TABLES } from '../shared/schema';
import { cacheKey } from '../shared/core/extract';
import { defaultDueAt, detectFlags, poNumber, type AliasTable, type PriceList } from '../shared/core';
import { detectedToRow, kl, toMyrSen } from './core-adapters';

const DAY = 86_400_000;
const FX = () => path.resolve(process.cwd(), 'fixtures');
const rnd = () => randomBytes(16).toString('hex');

function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export async function seedDatabase(rootDb: Db, storage: Storage, now = Date.now(), opts: { quiet?: boolean } = {}) {
  await rootDb.transaction(async db => { await seedInTx(db as unknown as Db, storage, now, opts); });
}

const RATE_BP: Record<string, number> = { USD: 42000 };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function seedInTx(db: Db, storage: Storage, now: number, opts: { quiet?: boolean }) {
  const seed = JSON.parse(readFileSync(path.join(FX(), 'seed.json'), 'utf8'));
  const at = (d?: number) => (d === undefined || d === null ? null : new Date(now - d * DAY));

  // 1. truncate in FK-agnostic fashion (no FKs declared; one statement)
  await db.execute(sql.raw(`TRUNCATE TABLE ${ALL_TABLES.filter(t => t !== 'extractions').map(t => `"${t}"`).join(', ')} RESTART IDENTITY`));

  // 2. settings
  const nowDate = new Date(now);
  const yymm = poNumber(kl(nowDate), 0).slice(3, 7);
  const maxSeq = Math.max(0, ...seed.purchaseOrders.filter((p: any) => p.poNo.startsWith(`PO-${yymm}-`)).map((p: any) => Number(p.poNo.slice(-3))));
  const { pins: _pins, ...shop } = seed.shop;
  await db.insert(S.settings).values([
    { key: 'shop', value: shop }, { key: 'checks_left', value: 50 }, { key: `po_seq:${yymm}`, value: maxSeq },
  ]);

  // 3. suppliers, price list, aliases
  await db.insert(S.suppliers).values(seed.suppliers.map((s: any) => ({
    id: s.id, name: s.name, whatsapp: s.whatsapp, isForeign: s.isForeign, country: s.country, policyNote: s.policyNote,
  })));
  const plRows = Object.entries(seed.priceList as Record<string, PriceList>).flatMap(([supplierId, pl]) =>
    Object.entries(pl).map(([sku, e]) => ({ supplierId, sku, lastInvoiceSen: e.lastInvoiceSen ?? null, agreedSen: e.agreedSen ?? null })));
  await db.insert(S.priceList).values(plRows);
  const aliasRows = Object.entries(seed.aliases as AliasTable).flatMap(([supplierId, t]) =>
    Object.entries(t).map(([normalisedDesc, sku]) => ({ supplierId, normalisedDesc, sku })));
  if (aliasRows.length) await db.insert(S.aliases).values(aliasRows);

  // 5 (before POs). fixtures -> storage + extractions; documents rows only for referenced fixtures
  const docsDir = path.join(FX(), 'docs');
  const pngs = readdirSync(docsDir).filter(f => f.endsWith('.png'));
  const fixtureDocs: Record<string, { id: string; sha: string; width: number; height: number; expected: any }> = {};
  for (const f of pngs) {
    const bytes = readFileSync(path.join(docsDir, f));
    const sha = cacheKey(bytes);
    const key = `docs/${sha}.png`;
    if (!(await storage.exists(key))) await storage.put(key, bytes);
    const expected = JSON.parse(readFileSync(path.join(docsDir, f.replace(/\.png$/, '.expected.json')), 'utf8'));
    await db.insert(S.extractions).values({ sha256: sha, model: 'fixture', doc: expected }).onConflictDoNothing();
    fixtureDocs[`docs/${f}`] = { id: `doc_${f.replace(/\.png$/, '')}`, sha, ...pngSize(bytes), expected };
  }
  const usedFixtures = new Set<string>();
  const addDoc = async (fixture: string, kind: string, photoKind: string) => {
    const fx = fixtureDocs[fixture];
    if (!usedFixtures.has(fixture)) {
      usedFixtures.add(fixture);
      await db.insert(S.documents).values({ id: fx.id, kind, photoKind, storageKey: `docs/${fx.sha}.png`, mime: 'image/png', sha256: fx.sha,
        width: fx.width, height: fx.height, pageCount: 1, uploadedByRole: 'owner', createdAt: new Date(now - 5 * DAY) });
    }
    return fx;
  };

  // 4. purchase orders
  const poDocs: Record<string, string> = {};
  for (const p of seed.purchaseOrders) {
    let docId: string | null = null; let expected: any = null;
    if (p.fixture) { const fx = await addDoc(p.fixture, 'po', 'po'); docId = fx.id; expected = fx.expected; poDocs[p.id] = fx.id; }
    await db.insert(S.purchaseOrders).values({ id: p.id, poNo: p.poNo, supplierId: p.supplierId, documentId: docId, source: p.source,
      orderedAt: at(p.daysAgo)!, createdAt: at(p.daysAgo)! });
    await db.insert(S.poLines).values(p.lines.map((l: any, i: number) => ({
      id: `${p.id}_${i + 1}`, poId: p.id, sku: l.sku, description: l.description, orderedQty: l.orderedQty, unit: l.unit ?? null,
      unitPriceSen: l.unitPriceSen ?? null, box: expected?.lines?.[i]?.box_2d ?? null, position: i })));
  }

  // 6. invoices
  const invDocs: Record<string, string> = {};
  const invBons: Record<string, string> = {};
  for (const i of seed.invoices) {
    let docId: string | null = null; let expected: any = null;
    if (i.fixture) { const fx = await addDoc(i.fixture, 'invoice', 'invoice'); docId = fx.id; expected = fx.expected; invDocs[i.id] = fx.id; }
    if (i.bonFixture) { const fx = await addDoc(i.bonFixture, 'delivery_note', 'signed_bon'); invBons[i.id] = fx.id; }
    const issuedAt = at(i.daysAgo)!;
    const bp = i.exchangeRateToMYR ? RATE_BP[i.currency] ?? null : null;
    const snapshot: PriceList = i.id === 'inv_2207' ? {} : (seed.priceList[i.supplierId] ?? {});
    await db.insert(S.invoices).values({
      id: i.id, invoiceNo: i.invoiceNo, supplierId: i.supplierId, poId: i.poId, documentId: docId, docDate: ymd(issuedAt),
      currency: i.currency, exchangeRateBp: bp, totalForeignMinor: i.totalForeignMinor ?? null, totalSen: i.totalSen, issuedAt,
      payment: i.payment, paidAt: at(i.paidDaysAgo), dueAt: new Date(defaultDueAt(issuedAt.getTime())),
      ownerMarkedCorrect: !!i.ownerMarkedCorrect, extractionModel: null, priceListSnapshot: snapshot, createdAt: issuedAt,
    });
    await db.insert(S.invoiceLines).values(i.lines.map((l: any, n: number) => ({
      id: `${i.id}_${l.lineId}`, invoiceId: i.id, lineId: l.lineId, sku: l.sku, description: l.description, qty: l.qty, unit: null,
      unitPriceSen: l.foreignUnitMinor !== undefined && bp ? toMyrSen(l.foreignUnitMinor, bp) : l.unitPriceSen,
      unitPriceForeignMinor: l.foreignUnitMinor ?? null, lineTotalSen: l.foreignUnitMinor !== undefined && bp ? toMyrSen(l.qty * l.foreignUnitMinor, bp) : l.qty * l.unitPriceSen,
      box: expected?.lines?.[n]?.box_2d ?? null, position: n })));
    if (invBons[i.id]) await db.update(S.documents).set({ invoiceId: i.id }).where(eq(S.documents.id, invBons[i.id]));
    await db.insert(S.receivedCounts).values(Object.entries(i.received as Record<string, number>).map(([key, qty]) => ({
      invoiceId: i.id, key, qty, recordedByRole: 'staff', recordedAt: issuedAt })));
  }

  // 7. flags: rules engine output merged with seed.flags
  for (const sf of seed.flags) {
    const inv = seed.invoices.find((i: any) => i.id === sf.invoiceId);
    const po = seed.purchaseOrders.find((p: any) => p.id === inv.poId);
    const pl: PriceList = inv.id === 'inv_2207' ? {} : seed.priceList[inv.supplierId];
    const detected = detectFlags({ supplierId: inv.supplierId, po: po.lines, invoice: inv.lines, received: inv.received, priceList: pl, aliases: seed.aliases })
      .find(d => d.invoiceLineId === sf.invoiceLineId && d.type === sf.type);
    if (!detected) throw new Error(`seed flag ${sf.id} has no matching detected flag`);
    const base = detectedToRow(detected, { id: sf.id, token: rnd(), supplierId: sf.supplierId, invoiceId: sf.invoiceId, poId: sf.poId });
    await db.insert(S.flags).values({
      ...base, amountSen: sf.amountSen, status: sf.status, settlement: sf.settlement ?? null, request: sf.request ?? null,
      baselineUnitSen: sf.baselineUnitSen ?? base.baselineUnitSen, baselineSource: sf.baselineSource ?? base.baselineSource,
      openedAt: at(sf.openedDaysAgo), sentAt: at(sf.sentDaysAgo), settledAt: at(sf.settledDaysAgo), createdAt: at(sf.openedDaysAgo ?? 0)!,
    });
    const docIds = [invDocs[sf.invoiceId], invBons[sf.invoiceId], poDocs[sf.poId]].filter(Boolean);
    for (const d of docIds) await db.insert(S.flagPhotos).values({ flagId: sf.id, documentId: d }).onConflictDoNothing();
  }

  // 8. events
  await db.insert(S.events).values(seed.events.map((e: any) => ({ at: at(e.daysAgo)!, role: e.role, action: e.action, ref: e.ref, meta: null })));

  if (!opts.quiet) console.log(`[seed] ok: ${seed.suppliers.length} suppliers, ${seed.purchaseOrders.length} POs, ${seed.invoices.length} invoices, ${seed.flags.length} flags, ${pngs.length} fixtures`);
}

/** Fixture reads cached by sha256 so sample documents never need a live Gemini call. Idempotent: run at every boot, so a redeploy with regenerated fixtures keeps working without a demo reset. */
export async function ensureFixtureCache(db: Db) {
  const dir = path.join(FX(), 'docs');
  let n = 0;
  for (const f of readdirSync(dir).filter(x => x.endsWith('.png'))) {
    const expected = JSON.parse(readFileSync(path.join(dir, f.replace(/\.png$/, '.expected.json')), 'utf8'));
    const r = await db.insert(S.extractions).values({ sha256: cacheKey(readFileSync(path.join(dir, f))), model: 'fixture', doc: expected }).onConflictDoNothing().returning({ sha: S.extractions.sha256 });
    n += r.length;
  }
  return n;
}

export async function seedIfEmpty(db: Db, storage: Storage) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(S.suppliers);
  if (r.n === 0) await seedDatabase(db, storage);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('server', 'seed.ts'));
if (isMain) {
  const { db, pool } = makeDb();
  seedDatabase(db, makeStorage()).then(() => pool.end()).catch(e => { console.error(e); process.exit(1); });
}
