# Fix round 3: FINAL (A–Z)

> Built from three full audits of `30ee06f` (functional, UI, demo/deploy) plus the four deck scenarios.
> **Pull first:** this round needs the new `shared/core/delivery.ts`, two new fixtures and `seed.json` PO-2610-006 (commit after `30ee06f`, 116 core tests passing).

```text
FIX ROUND 3 — FINAL. Tepat Bill. This is the last Replit round: make it complete, robust and crafted. Work strictly in the order below; IDs are referenced in your report.

RULES
R1. Max 2 attempts per item. Still failing → revert only that item, append `- <date> · SKIPPED · <ID> · <reason>` to docs/DECISIONS_LOG.md, move on. Never retry a skipped item.
R2. Change only what an item names. No new dependencies except `compression` (P0.9). Never edit shared/core/* or fixtures/*. All money comes from shared/core; display-only NumberFlow is the only float allowed.
R3. After each section (P0, P1, P2, P3, P4) run `npm test` and `npm run typecheck` and fix what you broke. Browser testing happens only at FINISH.
R4. Don't ask me anything, don't wait, don't stop before FINISH. Log choices in docs/DECISIONS_LOG.md.
R5. Budget order: P0 → P1 → P2 → P3 → P4. P0–P2 are must-do. Within a section, go top to bottom.
R6. Motion budget stays as in round 2: no pulses, no stagger, no whileTap, no glows, no gradients. The evidence highlight stays STATIC.

═══ P0. DEMO + DEPLOY BLOCKERS ═══
P0.1 Decimal boxes break saving a live read.
     - server/routes/orders.ts:16 → `const Box = z.array(z.number().min(-10).max(1010)).length(4).transform(a => a.map(v => Math.max(0, Math.min(1000, Math.round(v))))).nullish();`
     - client review.tsx (~81): `const normBox = (b?: number[]) => b?.length === 4 && b.every(Number.isFinite) ? (() => { const [y1,x1,y2,x2] = b.map(v => Math.max(0, Math.min(1000, Math.round(v)))); return y2 > y1 && x2 > x1 ? [y1,x1,y2,x2] as Box : null; })() : null;` Use it when seeding rows.
P0.2 Normalise AI fields in review.tsx before looksForeign and before saving:
     - normDate(s): accept YYYY-MM-DD, D/M/YYYY, D-M-YYYY, D.M.YY (two-digit year → 20YY); return ISO or ''.
     - normCur(s): '', 'RM', 'MYR', anything starting 'RINGGIT', or anything that isn't 3 letters → 'MYR'.
     - Country 'MY' | 'MYS' | 'MALAYSIA' → undefined when calling looksForeign.
     - server orders.ts:18 and :53: `country: z.string().trim().max(60).optional().transform(c => c && /^[A-Za-z]{2}$/.test(c) ? c.toUpperCase() : undefined)`.
P0.3 Early tap on save drops the PO (RM110 becomes RM90).
     - review.tsx: disable save while `kind==='invoice' && poPick===undefined && (sugg.isLoading || sugg.isFetching)`; show a Skeleton chip while loading.
     - Auto-pick the top suggestion only if supplierId is set, or top.supplierName has tokenOverlap ≥ 0.6 with supplierName.
P0.4 Foreign confirm for an EXISTING supplier: in save.mutationFn, before posting the invoice, `if (foreignOk && supplierId && !supplier?.isForeign) await api.patch(`/suppliers/${supplierId}`, { isForeign: true, country: /^[A-Z]{2}$/.test(country ?? '') ? country : null })`. Then invalidate ['suppliers'] and ['ledger'].
P0.5 Late photos never reach flags. server/routes/documents.ts:
     - Before the insert: if body.invoiceId is set, require kind ∈ {photo, delivery_note} and that the invoice exists (else 422/404).
     - After the insert: `const c = await loadContext(deps.db, invoiceId); if (c) await attachPhotos(deps.db, c);`
     - Client count.tsx photo success also invalidates ['flag'] and ['flags'].
P0.6 server/db.ts makeDb:
     - Pool gets `connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000`.
     - `pool.on('error', e => console.error('[pg] idle client error', e.message))`.
     - In getDb only (not tests): `setInterval(() => shared!.pool.query('select 1').catch(() => {}), 240_000).unref()`.
P0.7 Per-model Gemini budgets, so the fallback actually runs on a slow primary (server/routes/extract.ts):
     - Import wrapLanguageModel and APICallError from 'ai'.
     - `const budget = (m, ms) => wrapLanguageModel({ model: m, middleware: { wrapGenerate: async ({ doGenerate }) => { let t; try { return await Promise.race([doGenerate(), new Promise((_, rej) => { t = setTimeout(() => rej(new APICallError({ message: 'timeout', url: 'gemini', requestBodyValues: {}, statusCode: 504, isRetryable: true })), ms); })]); } finally { clearTimeout(t); } } } })`.
     - Call `extractWithFallback(budget(models.primary, 20_000), budget(models.fallback, 15_000), …)`.
     - Default EXTRACT_TIMEOUT_MS 38_000. Log `console.log('[extract]', { ms, model, ok, cached })`.
P0.8 Evidence link origin (server/routes/messages.ts): `const base = process.env.PUBLIC_BASE_URL?.trim(); const origin = base && /^https:\/\//.test(base) && !(process.env.NODE_ENV === 'production' && base.includes('.replit.dev')) ? base.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;`
P0.9 server/index.ts production hardening:
     - `npm i compression@1 @types/compression` and `app.use(compression())` before the routers.
     - `app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }))` before the existing static (which gets maxAge 0).
     - SPA fallback returns 404 when `/\.[a-z0-9]+$/i.test(req.path)`.
     - `server.keepAliveTimeout = 65_000; server.headersTimeout = 66_000`.
     - console.warn at boot when GEMINI_API_KEY, DEMO_FIXTURES or PUBLIC_BASE_URL is missing.
     - /api/health returns `{ ok, db: true, storage: storage.driver, gemini: !!process.env.GEMINI_API_KEY, demo: process.env.DEMO_FIXTURES === '1' }`.
     - Wrap seedIfEmpty in try/catch (log; keep serving).
P0.10 server/storage.ts: expose `driver: 'replit' | 'disk' | 'memory'` (set after the probe). In production, when it falls back to disk, log `console.error('[storage] PRODUCTION IS USING LOCAL DISK – photos will be lost on redeploy')`.
P0.11 Deploy:
     - package.json: move drizzle-kit, esbuild and tsx from devDependencies to dependencies (same exact versions).
     - .replit [deployment] run = ["sh", "-c", "npm run db:push || echo '[deploy] db:push FAILED'; npm run start"].
     - Add a line to replit.md Agent notes: never set NODE_ENV as a secret.
P0.12 Sending survives WhatsApp backgrounding (message-sheet.tsx):
     - The sent mutationFn uses `fetch('/api/flags/sent', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flagIds: ids, reminder: rem }) })`, throwing on !ok.
     - onError: toast.error(t('common.error')).
     - onSuccess: invalidate ['flag'], ['flags'], ['home'], ['invoice'].
     - flag-detail ['flag', id] query: refetchOnWindowFocus: true.
P0.13 Reminders are logged on POST, not GET (server/routes/messages.ts):
     - Remove the flag.remind logging from GET /flags/:id/message.
     - POST /flags/sent accepts `{ flagIds, reminder?: boolean }` and, when reminder is true, logs flag.remind per flag instead of re-stamping sentAt. De-duplicate flagIds; all flags must share one invoice/delivery (else 400).
     - Update api.test.ts.
P0.14 Atomic status changes:
     - flag-actions.ts (approve, dismiss, report-price, link-substitute) and money.ts (dispute, reopen, settle): the update uses `.where(and(eq(S.flags.id, row.id), eq(S.flags.status, row.status))).returning()`; no row → ApiError(409, 'bad_state', 'Aduan ini sudah diproses'). Each update and its logEvent go in one db.transaction.
     - PUT counts, report-price and link-substitute start their transaction with `select id from invoices where id = $1 for update`.
     - shared/schema.ts:
       - uniqueIndex on invoices (supplier_id, lower(invoice_no));
       - uniqueIndex on flags (invoice_id, invoice_line_id, type) where stage = 'invoice';
       - and (delivery_id, invoice_line_id, type) where stage = 'delivery' (see P1).
     - orders.ts maps Postgres 23505 → 409 duplicate_invoice with invoiceId.
     - Client: on a 409, refetch and toast t('flag.alreadyDone') ("Aduan ini sudah diproses").

═══ P1. THE FOUR SCENARIOS (deck slides 4–5) ═══
Today the app only checks at invoice time (counts are typed on the invoice). The deck's flow has TWO moments:
- DELIVERY: the bon/DO arrives → count → (1) correct delivery, or (2) wrong delivery flagged.
- INVOICE: the bill arrives later → compared automatically against what was received, the PO and the agreed prices → (3) correct → pay, or (4) wrong → flagged.
Use ONLY the new core helpers in shared/core/delivery.ts: checkDelivery, receivedFromDelivery, readyToPay, claimableSen. They are tested against the fixtures in shared/core/fixtures.test.ts ("the four deck scenarios") — read those tests first. The old invoice-with-counts flow stays as the fallback ("Tiada penghantaran").

S1 Schema (shared/schema.ts + npm run db:push):
   - deliveries: id, supplier_id, po_id nullable, document_id nullable, do_no, doc_date nullable, received_at (recorded time), owner_marked_correct bool default false, invoice_id nullable UNIQUE, created_at.
   - delivery_lines: id, delivery_id, line_id ('L1'…), sku nullable, description, qty int, unit nullable, box jsonb nullable, position.
   - delivery_counts: delivery_id, key ('line:<id>' or sku), qty int, recorded_by_role, recorded_at; PK(delivery_id, key).
   - flags: add stage text not null default 'invoice' ('delivery' | 'invoice'), delivery_id nullable, superseded_by nullable (flag id). invoice_id becomes nullable for delivery-stage flags.
   - Add the tables to ALL_TABLES (tests clone them) and to the seed truncation list (seed doesn't create deliveries).
S2 Server routes (new file server/routes/deliveries.ts, mounted like the others; staff may do everything in S2 except the owner-only actions noted):
   - POST /api/deliveries { supplierId | newSupplier, poId?, documentId?, doNo, docDate?, lines[] } → { id }. Match lines to PO skus with matchLine (store sku). Duplicate (supplier, lower(doNo)) → 409 duplicate_delivery.
   - GET /api/deliveries (recent, with state) and GET /api/deliveries/:id (lines, counts, flags, photos, po, supplier).
   - PUT /api/deliveries/:id/counts { counts } → merge over defaults (each line `line:<id>` = its qty) → checkDelivery({ supplierId, po, lines, received, priceList, aliases }) → replace this delivery's PROPOSED delivery-stage flags in place (same pattern as replaceProposedFlags: keep id/token when (lineId, type) matches).
     - Flags: stage 'delivery', delivery_id set, invoice_id null, amountSen = the estimate.
     - Default request: send_missing for short_qty, collect_back for not_ordered.
     - Returns { flags, estimateSen: claimableSen(flags) }.
   - POST /api/deliveries/:id/mark-correct (owner, mark_correct): 409 unless no unresolved delivery flags.
   - POST /api/delivery-suggestions { supplierId, poId? } → unlinked deliveries of that supplier from the last 30 days, same PO first, nearest date.
   - Photos: documents may carry delivery_id (add the column); attach them to delivery flags like attachPhotos does for invoices.
S3 Delivery flags never touch money:
   - supplierLedger, last30Days/rangeSummary, supplier totals, CSV money and the home hero must receive ONLY stage='invoice' flags (filter at every call site in server/flag-view.ts, routes/home.ts, routes/money.ts, routes/extras.ts).
   - Lists and detail show delivery flags with the caption "Anggaran {rm}".
   - Approve, dismiss, message, evidence, dispute and settle work for delivery flags too. Settle on a delivery flag allows 'redelivered' (short) or 'credit_note'/'deducted' (stored but still money-neutral).
   - Settling a delivery short flag as 'redelivered' ALSO adds missingQty to delivery_counts for that line (the goods arrived), in the same transaction.
   - Messages: draftMessage takes invoiceNo = the DO number and invoiceDate = the DO date for delivery flags.
   - Evidence: buildEvidence receives the delivery mapped as an invoice-shaped object { id, invoiceNo: doNo, totalSen: 0, issuedAt, lines }. The page title says "Bon / DO" instead of "Invois" for delivery flags.
S4 Invoice compare:
   - On the invoice review screen, after the PO chip, show a delivery chip from /api/delivery-suggestions: "Bandingkan dengan DO-LB-0901 (24/10/2026)", with a dropdown and "Tiada penghantaran".
   - Saving with a deliveryId:
     1. set deliveries.invoice_id;
     2. build received = receivedFromDelivery({ supplierId, po, deliveryLines, deliveryReceived (delivery_counts), invoiceLines, aliases }) and store it as this invoice's received_counts;
     3. take the price_list_snapshot and run detectFlags exactly like the first count save (snapshot + autofill rules unchanged);
     4. respond { id, compared: true, flags, totalSen, readyToPay: readyToPay(flags) }.
   - The client then goes to /invoices/:id/compare (no count screen).
   - Supersede: for each new invoice-stage flag whose sku has an open/proposed delivery-stage short_qty flag in the linked delivery, set that delivery flag's superseded_by = the new flag id. Proposed ones become dismissed. Superseded flags are hidden from Perlu semakan/Terbuka and shown under Selesai with the chip "Dibawa ke invois". Delivery flags already settled 'redelivered' stay as they are.
S5 Screens:
   (a) /scan "Bon / DO" now offers two rows: "Penghantaran baru (semak barang)" → read → review → POST /api/deliveries → /deliveries/:id/count, and "Lampir pada invois" (the existing /bon/:docId attach).
   (b) Review supports kind 'delivery': no prices, the DO number field, the PO chip.
   (c) /deliveries/:id/count reuses the count screen component (pass a `mode="delivery"` prop).
       - Result: no flags → the stamp "PENGHANTARAN TEPAT" + an owner button "Sahkan tepat" (scenario 1).
       - Flags → "{n} perbezaan · Anggaran {rm}" with rows linking to the flags (scenario 2).
   (d) /invoices/:id/compare: an ink "PERBANDINGAN" header, a 3-column ledger per line: Dipesan (PO) · Diterima (delivery) · Dibil (invoice) + unit price vs reference price; mismatching cells in the type colour.
       - readyToPay → the stamp "INVOIS TEPAT", the line "Sedia untuk dibayar" with <Money animate> = this invoice's netOwedSen from supplierLedger (row for this invoice), and the owner button "Tandakan sudah dibayar" (PATCH payment) (scenario 3).
       - Otherwise → "{n} perbezaan · {rm}" + "Lihat aduan" (scenario 4).
   (e) Home: a "Penghantaran" section (last 5 deliveries: supplier, DO no., state chip tepat / ada isu / menunggu invois). Orders: a third tab "Penghantaran".
   (f) i18n ms + en for every new string. Terms: penghantaran, bon/DO, perbandingan, anggaran, sedia untuk dibayar.
S6 Tests (server/api.test.ts, the 4 scenarios end-to-end on the seeded test schema using the fixture expected.json files):
   1. Lim DO-LB-0901 vs po_006, no count changes → 0 flags; mark-correct → 200.
   2. DO-5512 vs po_004 with {line:L1: 8} → exactly one delivery flag, short_qty maggi-kari, amountSen 9000; ledger for sup_ali unchanged.
   3. LB-7810 linked to delivery 1 → compared, 0 flags, readyToPay true, totalSen 28560; PATCH payment paid → 200.
   4. INV-2291 linked to delivery 2 → flags exactly [short_qty maggi-kari 9000, price_change gula-pasir-1kg 2000]; the delivery-2 flag has superseded_by set; sup_ali payNowSen 96200; settle the Maggi invoice flag deducted → 87200.

═══ P2. CRAFTED UI (removes the remaining "template" look) ═══
U1  client/src/index.css:74-87: replace the unlayered rules with `@utility num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }`, `@utility tnum { font-variant-numeric: tabular-nums; }` and `@layer components { .skeleton { background: var(--surface-2); border-radius: 14px; } }`. Delete the shimmer keyframes and the #f8faff value.
U2  The stamp must be SEEN. flag-detail.tsx: `const [justStamped, setJustStamped] = useState(false)`.
    - On settle success: scrollTo top, setJustStamped(true), navigate to /suppliers/:sid after 900 ms.
    - Approve/dispute: setJustStamped(true) without navigating.
    - Pass thunk={justStamped}, never thunk={status==='settled'}.
U3  Chips (components/ui/badge.tsx): rectangular ink outline chips.
    - Base: `inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[3px] text-[11px] font-medium uppercase leading-none tracking-[.06em]`.
    - Tones: neutral 'border-line text-ink-2', brand 'border-brand/50 text-brand', and the same pattern for short/price/notord/ok/dispute. No bg-*.
U4  Tabs (components/ui/tabs.tsx): an underline ledger.
    - List: `flex border-b border-line`.
    - Trigger: `relative flex flex-1 items-center justify-center min-h-11 px-2 text-sm font-medium text-ink-2 data-[state=active]:text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] data-[state=active]:after:bg-ink`.
    - flags.tsx: the label `flags.tab.review` = 'Perlu semak', whitespace-nowrap, aria-label "{label} {n}".
U5  SectionLabel in components/page.tsx: `<h2 className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[.12em] text-ink-2">{children}{count!==undefined && <span className="num">{count}</span>}<span aria-hidden className="h-px flex-1 border-t border-dashed border-line"/></h2>`. Use it for every section heading on home, count, flag-detail, evidence, supplier-detail, invoice-detail and compare.
U6  A double rule under every total (home hero amount, supplier Pay now, count/compare result, invoice total): `inline-block border-b-[3px] border-double pb-1` (white/30 on ink, else border-ink).
U7  One bordered container with dashed rows (`overflow-hidden rounded-card border border-line bg-surface`, rows `border-t border-dashed border-line first:border-t-0`) for: read.tsx list, review.tsx rows (remove motion layout/ring/stagger; the active row gets a 3px brand left bar), suppliers, orders, staff home, bon list, evidence siblings, invoice-detail flags (use <FlagLedger>). divide-y lists become divide-dashed.
U8  Ledger column headers (11px caps: "BARANG · KTT · HARGA" on read/invoice, "BARANG / DITERIMA" on count) and mono row indexes `01 02` on read, count and invoice-detail.
U9  Radio-ledger pickers instead of stacked blue buttons:
    - the flag request selector (flag-detail.tsx:168-170) and the review supplier picker (review.tsx:250,262);
    - rows min-h-[52px] with a 20px radio dot and a 3px brand left bar when selected; role="radiogroup"/"radio" + aria-checked.
    - Shorten flag.req.agreed to 'Caj ikut harga persetujuan'.
U10 count.tsx:
    - The billed label moves under the description ("Dalam invois: {n}" with the number in .num); the stepper row becomes `mt-3 flex justify-end`.
    - The changed (handwritten) number has no box: `border-0 border-b-2 border-brand/40 rounded-none bg-transparent text-[32px]`.
    - Long-press buzzes only on the first step.
    - PO-only rows: no opacity, plus a caption "DIPESAN" instead.
U11 The count/compare result is a real <Sheet> (no backdrop dismiss while showing results; a title from i18n). It uses the Stamp for all-correct (Stamp gets label?/colour? props), no icon circles, and count.done = 'Tutup'.
U12 Scan:
    - scan.tsx:76-79 buttons stacked (`flex flex-col gap-2`, block); scan.file 'Pilih fail'.
    - Option rows with a one-line hint (scan.po.hint 'Buku nota atau WhatsApp', scan.invoice.hint 'Bil daripada pembekal', scan.bon.hint 'Bon hantar bertandatangan').
    - Tapping an option opens the camera directly (setKind + snap.current?.click()).
    - Remove the dashed empty frame.
U13 Evidence page as a document:
    - a small caps "TEPAT BILL · BUKTI" line with the logo;
    - h1 t('evidence.title') text-2xl;
    - a mono reference line "No. INV-2291 · 20/10/2026";
    - a dashed rule, then the facts;
    - the Stamp for status;
    - siblings with toned chips;
    - an error state with a "Cuba lagi" retry for network errors (react-query retry 2 except 404);
    - fetchPriority="high" decoding="async" on the invoice image.
    - ev.from = 'Daripada {shop}, berkenaan invois {no}'.
U14 E-invoice preview: replace the red alert band with a Stamp (label t('einv.status.'+status)) top-right plus a small caps line t('einv.ribbon') in text-notord.
U15 Remove decorative circles: empty-state icon circle (page.tsx:23), activity P/K avatars (use a 3px left bar, ink for owner and line for staff, plus a role caption), result icon circles. Keep only the stepper buttons and the scan button round.
U16 Shell:
    - index.html theme-color #F5F3EC, an SVG favicon of the logo, `<meta name="robots" content="noindex,nofollow">`, og:title "Tepat Bill · Bukti" + og:description.
    - Non-blocking fonts (media="print" onload="this.media='all'" + noscript).
    - Bottom nav: a "Imbas" label under the scan button, a 2px ink active bar on the active tab, aria-label with the badge count, badge text-brand-ink.
    - i18n provider sets document.documentElement.lang.
U17 One radius (--radius-card 14px; replace rounded-2xl with rounded-card everywhere). Sheet easing `data-[state=open]:ease-[cubic-bezier(0.32,0.72,0,1)] data-[state=open]:duration-300`, max-h-[92dvh] overflow-y-auto. Delete lib/motion.ts listItem. Remove the remaining shadow-none/active:scale leftovers.
U18 360px layout:
    - Supplier invoice rows keep ONE chip (state); payment goes into the date line.
    - The agreed-price row becomes a grid with an "RM" prefix inside the input.
    - Flag-detail header links become a wrap row of `inline-flex min-h-11` links.
    - Toasts on flag-detail use position 'top-center' (the action bar is 2 rows).
    - Invalid review inputs get `aria-[invalid=true]:border-notord aria-[invalid=true]:bg-notord-bg/40` and scroll into view on save.
    - Desktop: the column gets md:border-x and the body bg surface-2.
    - Fixed bars put their border on the inner 480px div.
    - Pages without Page use pt-[calc(16px+var(--safe-top))].
U19 Copy (ms.ts + en.ts):
    - Apply: home.flagged 'Jumlah aduan'; read.status3 'Memadankan barang…'; review.noPo 'Tiada pesanan'; review.pickPo 'Pilih pesanan'; review.poChip 'Sepadan dengan {po}'; count.photos 'Gambar bukti'; count.addDelivery 'Gambar penghantaran'; bon.title 'Bon ini untuk invois mana?'; flag.requestLabel 'Minta pembekal'; flag.basePrice 'Harga rujukan'; flag.subQ 'Adakah ini barang ganti untuk yang dipesan?'; flag.req.collect 'Ambil semula, tanpa caj'; sup.reduced 'Ditolak {rm}'; act.invoice.mark_correct 'Invois disahkan tepat'; settings.resetDone 'Demo telah diset semula'; act.demo.reset 'Data demo diset semula'; home.allClear 'Semua beres. Tiada apa-apa perlu dibuat.'; einv.release 'Keluarkan (log sahaja)'.
    - Flag-detail dismiss sheet body: 'Aduan ini tidak akan dihantar kepada pembekal. Anda masih boleh lihat di tab Selesai.'
    - EN parity for all of these. Delete unused keys.
    - Dates in the UI language everywhere (ms-MY / en-GB, numeric DD/MM/YYYY).
U20 Accessibility: real alt texts (scan preview, line-crop, doc-image, photo-viewer, flag photos); the stepper aria-label `${t('review.qty')} · ${description}`; tap targets ≥44px ("Lihat semua", invoice links); the reminder dot becomes a text caption "Perlu peringatan"; the message textarea gets a focus outline.

═══ P3. FUNCTIONAL GAPS ═══
F1  Supplier page (supplier-detail.tsx + money.ts:97 returns country):
    - The owner can edit the policy note (textarea), the WhatsApp number (show toMsisdn validity) and the foreign toggle via PATCH /suppliers/:id; staff see them read-only.
    - A flags section using <FlagLedger> from /flags?supplierId=.
    - A "Kembali" back button.
F2  Dispute with a note: a Sheet with a textarea → POST dispute { note } (money.ts stores flags.note, event meta). Show the note on the flag.
F3  Payment: PATCH /invoices/:id/payment { payment, paidAt?, dueAt? }. Keep the existing paidAt when re-marking paid; 400 when nothing changes. The owner gets a due-date input on invoice rows.
F4  invoice-detail.tsx:
    - the server adds lineTotalSen, canMarkCorrect, state and hasDraft to GET /invoices/:id;
    - render lineTotalSen (no client multiplication);
    - owner payment toggle + "Sahkan tepat";
    - "Lihat e-invois" when hasDraft;
    - a back button (history.back, fallback /orders);
    - a link to /invoices/:id/compare when the invoice was compared.
F5  "Ini kenaikan biasa": dismiss { asInflation: true } for price_change up → autofillPriceList for that sku via the core functions; logged with { asInflation }. A secondary button on price flags.
F6  "Taip sendiri" on /scan for order/invoice/delivery → /review/{kind}/new.
F7  Home: /api/home adds credits (suppliers with creditCarrySen > 0), recent (last 5 events), checksLeft. Render credit chips → /suppliers/:id, recent activity → /activity, and the first-run empty state "Imbas invois pertama anda" with a CTA.
F8  Suppliers list: Pay now as the main figure + a dispute caption + next due date (server adds nextDueAt); ErrorState; an empty-state CTA.
F9  Orders: invoice rows show the state + payment chip (GET /invoices adds them); PO rows open /orders/po/:id (a simple read-only page using GET /pos/:id); the flag-detail PO link goes there; refetchOnMount 'always'.
F10 Count keys whitelist on PUT counts (invoice and delivery): only `line:<id>` of its lines and its PO skus; else 400; max 500 keys.
F11 use-fixture on a document already used by an invoice/PO/delivery → 409 document_in_use.
F12 sku minting: move the best-Jaccard + both-direction-overlap near-match from flags.ts into `nearSku()` in server/core-adapters.ts and use it in mintSkus too (a "Gula perang 1kg" PO line must mint gula-perang-1kg). Make skus unique with a -2/-3 loop.
F13 Count re-save with already processed flags: show 'Aduan untuk invois ini sudah diproses' + "Lihat aduan" instead of "Semua tepat".
F14 ErrorState (icon + common.error + retry; 404 → notFound) before the skeleton in invoice-detail, count, suppliers, orders, bon and einvoice. einvoice with draft null → an EmptyState back to the invoice; staff 403 → owner.only.
F15 Back buttons (BackButton in page.tsx: history.back(), fallback route) on read, review, count, bon, invoice-detail, supplier-detail, compare and deliveries. Empty-state CTAs to /scan on suppliers, orders and bon.
F16 Review: the image sticky at the top (sticky top-0 z-10 bg-bg, max 28dvh, NO blur); tapping a box scrolls its row (id row-{i}, scroll-mt-[32dvh]) into view.
F17 Invalidations after review save: ['pos'], ['invoices'], ['deliveries'], ['ledger'], ['ledgers'], ['home'].
F18 flag-detail: for non-proposed flags, "Lihat bukti" (opens /e/:token in a new tab) + "Salin pautan". "Pautkan" also offers every d.poOptions entry when there's no suggested substitute.
F19 count result list only shows flags with status proposed and not price decreases (keep as is), and the 'already processed' case from F13.
F20 report-price that dismisses shows the toast 'Harga sama dengan harga persetujuan. Aduan diabaikan.' and logs { dismissed: true }.

═══ P4. LOW / PERF ═══
L1  CSRF: for /api non-GET requests, 403 when an Origin header is present and its host ≠ req host, or when Sec-Fetch-Site === 'cross-site'.
L2  Asia/Kuala_Lumpur helper `kl(d)` in core-adapters for poNumber, dmy, ymd and the evidence date fallback.
L3  Login keypad also accepts keyboard 0–9 and Backspace.
L4  client fetch: `signal: AbortSignal.timeout(path.endsWith('/extract') ? 50_000 : 20_000)`. XHR upload: timeout 60_000 + ontimeout reject. Parse error JSON; 401 → back to login; 413/415 → toasts scan.tooLarge / scan.badType.
L5  image.ts: decode once; imageSmoothingQuality 'high'. For JPEG, read the EXIF orientation (0x0112) from the first 64 KB and only upload the original bytes when it's missing or 1.
L6  App.tsx: a lazyRetry wrapper for every page (reload once on a chunk-load error, using a sessionStorage flag).
L7  read.tsx: sort the fixture picker so a fixture matching the read's supplier/docNo is first; keep the 7 s delay (log it in DECISIONS_LOG: deliberate for the demo).
L8  Production CSP header: `default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'`.
L9  Optimistic status updates on approve/settle (setQueryData on ['flag', id], roll back onError).
L10 CSV: add a "Tarikh cetak" (docDate) column.

═══ TESTS (server/api.test.ts) ═══
T1 The four scenarios (S6).
T2 Decimal box save → 201, stored as integers.
T3 nearSku: "Gula perang 1kg" mints gula-perang-1kg.
T4 A photo uploaded after counts appears in the evidence payload.
T5 Concurrency:
   - two parallel approves → one 200 + one 409, and one event;
   - two parallel identical POST invoices → one 201 + one 409.
T6 Reminder: GET ?reminder=1 logs nothing; POST sent { reminder: true } logs flag.remind and reminderDue becomes false.
T7 Payment keeps paidAt; dueAt persists.
T8 Dispute note is stored and returned.
T9 Unknown count key → 400.
T10 use-fixture in-use → 409; fixtures routes 404 without DEMO_FIXTURES.
T11 Staff 403 on sent, settle, reopen, mark-correct (invoice and delivery), einvoice approve/release.
T12 home summary asserts exact last30Days values for the seed (invoice-stage flags only).

═══ FINISH ═══
1. Run `npm test`, `npm run typecheck` and `npm run build`; all must pass.
2. Production smoke on a spare port (NODE_ENV=production … sh -c "npm run db:push || true; node dist/index.js"): /api/health shows db/storage/gemini/demo, and / is served gzipped.
3. Settings → Set semula demo. One App Testing pass at 390px (OWNER_PIN=1234 STAFF_PIN=5678 on the workflow):
   a. Scenario 1: Scan → Bon/DO → Penghantaran baru → upload fixtures/docs/do_lim_brothers_DO-LB-0901.png → save → count unchanged → PENGHANTARAN TEPAT → Sahkan tepat.
   b. Scenario 3: Scan → Invois → fixtures/docs/invoice_lim_brothers_LB-7810.png → compare with DO-LB-0901 → INVOIS TEPAT · Sedia untuk dibayar RM285.60 → Tandakan sudah dibayar.
   c. Scenario 2: Scan → Bon/DO → fixtures/docs/bon_signed_DO-5512.png → Maggi 10 → 8 → "1 perbezaan · Anggaran RM90.00" → Lulus.
   d. Scenario 4: Scan → Invois → fixtures/docs/invoice_borong_ali_INV-2291.png → compare with DO-5512 → "2 perbezaan · RM110.00" → Maggi Lulus (Tolak jumlah), Gula Laporkan harga 2.80 → the delivery flag shows "Dibawa ke invois".
   e. Hantar → edit → Buka WhatsApp → the activity log shows no reminder.
   f. The evidence link logged out → document page, static highlight, signed bon.
   g. Maggi → Selesaikan → Nota kredit → the SELESAI stamp is visible → supplier page Pay now rolls RM962.00 → RM872.00.
   h. Staff login: no owner buttons.
   i. At 360px: scan buttons, count rows, flags tabs and the flag action bar don't overflow.
4. Reset the demo data again.
5. Update docs/PRD.md section 12: the demo script becomes the four scenarios (a–g order above, 120 s).
6. Update docs/PROGRESS.md ("Fix round 3" section, verified vs not).
7. FINAL message in exactly this format:
   DONE: <IDs>
   SKIPPED: <IDs with one-line reasons, or none>
   TESTS: <passed>/<total> · TYPECHECK ok/fail · BUILD ok/fail · PROD SMOKE ok/fail
   APP TEST: a … i ok/fail (one-line note per fail)
   NOT VERIFIED: <list>
```

## If the Agent stops early
```text
Continue FIX ROUND 3 from the first ID not yet done (check docs/DECISIONS_LOG.md and the code). Same rules R1–R6. End with the FINISH report format.
```
