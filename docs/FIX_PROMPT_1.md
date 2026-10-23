# Fix round 1 (from the Claude Code review of commits bc45272..0d28024)

> Pull from GitHub first: this round needs commit 0ece73e (the `shared/core/extract.ts` box-schema fix).
> Every file, route and function named below was checked against the code on `main`.

```text
FIX ROUND 1 — Tepat Bill. A full review of your M0–M10 build found demo-breaking bugs, deployment blockers and spec gaps. Fix them in the order below.

ANTI-LOOP RULES (follow strictly)
R1. Max 2 attempts per item. If an item still fails after 2 attempts: revert only that item's changes, append `- <date> · SKIPPED · item <n> · <one-line reason>` to docs/DECISIONS_LOG.md, and move on. Never retry a skipped item.
R2. Change only what an item names. No refactors, no renames, no new dependencies. Never edit shared/core/* or fixtures/*. No money arithmetic outside shared/core (display-only NumberFlow excepted).
R3. After each section (P0-A, P0-B, P0-C, P1, P2, P3) run `npm test` and `npm run typecheck`; fix what you broke before moving on. Do NOT run App Testing per item. Browser testing happens once, at FINISH.
R4. Don't ask me anything and don't wait for me. Log any choice in docs/DECISIONS_LOG.md. Stop only after FINISH, with the report in the exact format given there.
R5. Priority: P0 and P1 are must-do. Then P2. Then P3, only while everything is green. Cheapest items first.

P0-A. GEMINI (core is fixed now)
1. shared/core/extract.ts now uses a plain 4-number array for box_2d (no z.tuple), rounds/clamps boxes in linesToSen, and also falls back to Flash-Lite on NoObjectGeneratedError.
   - In server/routes/extract.ts, replace `readDocument` (from server/gemini.ts) with `extractWithFallback(primary, fallback, bytes, mediaType)` imported from shared/core/extract. Keep the existing timeout race, sha256 cache and checks_left logic.
   - Delete server/gemini.ts.
   - Update the extract entry in docs/DECISIONS_LOG.md: "resolved in core 0ece73e".

P0-B. DEMO BREAKERS
2. client/src/pages/read.tsx:
   - When DEMO_FIXTURES is on, show "Guna bacaan demo" also UNDER THE ROWS after any successful read whose model is not 'fixture' (not only while reading or in manual).
   - Lower the "Masih membaca" + demo-link delay from 12 s to 7 s.
   - Add `const fixtureChosen = useRef(false)`, set when a fixture is picked. While it is true, ignore any late live/timeout result in onSuccess.
   - When the result arrives, keep ScanBeam mounted 200 ms with fading=true, then unmount.
   - Client-side 45 s timer: if there is still no result, go to manual.
3. False reminder on first send (client/src/components/message-sheet.tsx + client/src/pages/flag-detail.tsx):
   - Bug: the `sent` success handler refetches the flag, sentAt flips the `reminder` prop to true while the sheet is open, the sheet refetches `?reminder=1`, and the server logs flag.remind.
   - Fix: inside MessageSheet, capture `reminder` once per opening (state set when `open` becomes true) and use only that captured value for the query key and URL. Close the sheet in the WhatsApp button onClick.
   - Server GET /api/flags/:id adds `reminderDue: boolean` = needsReminder(flag, now) AND no `flag.remind` event for that flag in the last 14 days. Reuse the same query logic as server/routes/home.ts.
   - flag-detail.tsx: after sending, show an ok chip "Dihantar {DD/MM/YYYY}". Show "Hantar peringatan" only when reminderDue; otherwise show a secondary "Hantar semula" that drafts the normal (non-reminder) message.
4. client/src/pages/count.tsx:
   - Disable "Simpan kiraan" while any photo upload is pending (save.isPending || photo.isPending).
   - Remove `capture` from the signed-bon input only; keep it on the delivery-photo input.
   - The flag rows in the result sheet become wouter Links to /flags/:id.
5. server/flags.ts replaceProposedFlags:
   - Today it deletes and re-inserts proposed flags, so ids and evidence tokens change and an open /flags/:id page 404s after Pautkan or a count re-save.
   - New behaviour: for each detected flag, if a PROPOSED row with the same (invoiceLineId, type) exists, UPDATE it in place (amount, baseline, missing qty, etc.; keep id and evidence_token). Insert new ones. Delete proposed rows that no longer match. Non-proposed rows are untouched, as today.
   - In flag-detail.tsx, after link-substitute navigate to /flags (the substituted line usually has no flag left).
6. client/src/pages/review.tsx live-read hardening:
   - before looksForeign and before saving, map currency 'RM', 'RM ' or empty/undefined to 'MYR';
   - send docDate only if it matches /^\d{4}-\d{2}-\d{2}$/;
   - on 422 error code po_supplier_mismatch show the toast "Pesanan ini milik pembekal lain";
   - on 409 duplicate_invoice show a toast with an action "Buka invois sedia ada" → /invoices/<error.invoiceId>.

P0-C. DEPLOYMENT BLOCKERS
7. Reset on the deployment:
   - server/routes/extras.ts POST /dev/reset is allowed when `process.env.NODE_ENV !== 'production' || process.env.DEMO_FIXTURES === '1'` (owner only, as now).
   - GET /api/checks returns `{ checksLeft, demo: process.env.DEMO_FIXTURES === '1' || process.env.NODE_ENV !== 'production' }`.
   - client/src/pages/settings.tsx shows "Set semula demo" when `demo` is true (not import.meta.env.DEV), confirmed in a bottom Sheet with a destructive button (replace window.confirm).
8. server/seed.ts:
   - do NOT truncate the `extractions` table (keeps the read cache; inserts already use onConflictDoNothing);
   - wrap the whole seed in db.transaction;
   - build docDate from local date parts (getFullYear/getMonth/getDate), not toISOString;
   - replace `Math.round(i.exchangeRateToMYR * 10000)` with a constant map `const RATE_BP: Record<string, number> = { USD: 42000 }` keyed by the invoice currency.
9. server/index.ts, before listen, when NODE_ENV === 'production': exit(1) with a clear console.error if SESSION_SECRET is missing or shorter than 32 characters, or if getPins() throws (missing or equal PINs).
10. .replit [deployment]:
    - run = ["sh", "-c", "npm run db:push && npm run start"], keep build = ["npm", "run", "build"];
    - remove the [[ports]] entry 5055→3000.
11. server/storage.ts:
    - `new Client()` never throws, so the disk fallback never kicks in.
    - Make makeStorage() return a lazy wrapper: on first use it probes once with `await client.exists('__probe__')`. If that throws or returns ok:false, switch permanently to diskStorage() and console.warn once.
    - Honour `STORAGE_DRIVER=disk` to force disk.
DEPLOY SMOKE (end of P0, mandatory)
- `npm run build`.
- Then `NODE_ENV=production PORT=5055 SESSION_SECRET=0123456789abcdef0123456789abcdef OWNER_PIN=1234 STAFF_PIN=5678 sh -c "npm run db:push && node dist/index.js"` in the background against the dev DB.
- `curl -s localhost:5055/api/health` must be ok, and `curl -s localhost:5055/` must return HTML.
- Kill it. If it fails, fix it (this counts as item 10).

P1. THE MONEY SHOT + KEY SCREENS
12. client/src/pages/supplier-detail.tsx:
    - Hero = Pay now: <Money sen={payNowSen} animate/> at text-[40px] leading-[44px] font-bold.
    - Below it, a 3-column grid of <Money animate>: Dipertikai (disputedSen); Kredit (creditCarrySen, with the caption "Pembekal berhutang {rm} kepada anda" when > 0); Baki penyata dijangka (owedSen).
13. Make RM962.00 → RM872.00 visibly roll (client/src/pages/flag-detail.tsx):
    - Add supplierId to the flag's client type (the server already sends it).
    - When the flag loads, call `qc.prefetchQuery({ queryKey: ['ledger', supplierId], queryFn: <same fn as supplier-detail> })`.
    - After a successful settle, navigate to /suppliers/<supplierId>.
    - Replace `done()` with an async function that awaits invalidation of ['flag', id], ['flags'], ['invoice', invoiceId], ['invoices'], ['ledger'], ['ledgers'], ['home']. Use it after approve, dismiss, report-price, link-substitute, dispute, reopen and settle.
    - count.tsx save also invalidates ['home'], ['ledger'] and ['ledgers'].
14. client/src/pages/home.tsx:
    - Selesai and Masih terbuka use <Money animate>.
    - Hero (notes #40): bg-ink (not bg-brand), min-h-[176px], label "30 hari lepas" at opacity-70, Ditanda at text-[40px] leading-[44px] font-bold, bottom 2-column grid with `divide-x divide-white/15` at text-xl.
    - Add a radial brand highlight: `bg-[radial-gradient(120%_80%_at_100%_0%,rgba(36,87,214,.45),transparent)]` as an overlay.
    - The card links to /flags; when all three are 0, show "Belum ada aduan".
    - Staff home: hide the owner-only lists; show a big primary "Rekod penghantaran" Link to /scan plus today's invoices (GET /api/invoices filtered client-side to issuedAt today).
15. client/src/pages/count.tsx:
    - The server PUT /api/invoices/:id/counts response adds totalSen = sum of the claimable flags' amountSen (computed server-side). Remove the client reduce.
    - Result total: `const [shown, setShown] = useState(0)`; after 250 ms set it to totalSen; render <Money sen={shown} animate/>.
    - Steppers: buttons h-14 w-14 rounded-full, number text-[28px]; long-press repeat (start after 400 ms, then every 120 ms, cleared on pointerup/leave); select the input text on focus.
    - Changed lines: `ring-2 ring-short bg-short-bg/40` plus <Badge tone="short">−N</Badge>. PO-only lines: opacity-60 bg-surface-2.
16. client/src/components/bottom-nav.tsx: show a badge = (needsAction count + followUp count) from useQuery(['home']), the same queryFn as home.tsx; hidden when 0.
17. client/src/pages/flag-detail.tsx:
    - Hide the BottomNav on /flags/:id.
    - Primary actions go in a sticky bottom bar: `fixed inset-x-0 bottom-0 bg-surface/85 backdrop-blur-xl border-t border-line px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]`. Proposed → Lulus + Abaikan. Open/disputed → Hantar + Pertikai + Selesaikan.
    - Settle choices open in a bottom Sheet. buzz(12) on approve and settle.
    - Staff viewing a proposed flag see a chip with a Clock icon + t('owner.only').
    - Baseline source as a <Badge tone="price">; PO number and invoice number as Links.
    - GET /api/flags/:id adds the supplier's policyNote and this flag's events. Show the policy note in a muted card and the events as a small timeline.
    - "Asingkan" ghost button on the substitute card (keeps the not_ordered flag; just closes the card).
    - Use the lucide Tag icon for price_change.
18. client/src/components/message-sheet.tsx:
    - An editable <textarea> seeded from the drafted text (reseed when the draft changes), styled as a WhatsApp chat bubble: bg-surface-2 wallpaper, white bubble `rounded-2xl rounded-tr-sm` with a small time stamp.
    - Build the link on the client with waLink(text, phone) imported from @shared/core, so edits are what gets sent. Copy copies the edited text.
    - BM/EN segmented control.
19. client/src/pages/evidence.tsx (the judge sees this on their own phone):
    - header: <Logo/> + "Bukti · Tepat Bill"; shop and supplier names; a status <Badge>;
    - the invoice date (server /api/public/evidence/:token adds invoiceDocDate; fall back to invoice.issuedAt);
    - use the existing `.hl-pulse` class on the SVG highlight instead of animate-pulse;
    - PhotoViewer accepts an optional `box` prop and renders the same SVG overlay inside the zoomed image;
    - a two-column PO line vs invoice line comparison (add ev.* keys in ms and en if missing);
    - alt "Invois {no}"; aspect-ratio from the document width/height; the t('evidence.readOnly') footer.
    - Update the evidence whitelist test in server/api.test.ts for the new key.
20. client/src/components/flag-card.tsx (notes #41):
    - a status chip and a relative age in the caption;
    - an 8px bg-dispute dot when reminderDue (add it to the flags list payload);
    - motion layoutId `flag-amt-{id}` on the amount and `flag-chip-{id}` on the chip, with the same layoutIds in the flag-detail header;
    - whileTap scale 0.98.
    - client/src/pages/flags.tsx: 4 tabs with counts: Perlu semakan · Terbuka · Dipertikai · Selesai (Selesai includes dismissed, chip "Diabaikan").

P2. SERVER CORRECTNESS
21. server/flags.ts no-PO implicit PO: sku = aliases[supplierId]?.[normalise(desc)] ?? an existing price_list sku of that supplier whose description has tokenOverlap ≥ 0.6 ?? the minted slug.
22. server/routes/flag-actions.ts report-price: if re-detection yields no price flag or amountSen === 0 → dismiss instead of opening.
23. server/flags.ts autofill: skip every sku that has an unresolved (proposed/open/disputed) price flag, regardless of direction.
24. server/routes/orders.ts POST /pos: 409 if the documentId is already used by another PO (mirror the invoice check).
25. Event names (notes #49):
    - server/routes/money.ts logs `invoice.mark_paid` / `invoice.mark_unpaid` and `flag.settle.<settlement>`.
    - Add act.* keys in BOTH ms.ts and en.ts for every action the server logs, including ai.read, ai.fixture, einvoice.prepare, einvoice.approve, einvoice.release_stub, export.csv and demo.reset.
    - client/src/pages/activity.tsx groups by day (sticky date headers) with a 32px role avatar (P owner, K staff).
26. server/app.ts error handler:
    - if res.headersSent → next(err);
    - pass through err.status/err.statusCode 400–499 as {error:{code:'bad_request'}};
    - Multer LIMIT_FILE_SIZE → 413; other MulterError codes → 400.
27. Small items:
    - server/routes/messages.ts: de-duplicate flagIds; all flags must share one invoiceId, else 400.
    - server/routes/orders.ts: PATCH with an empty body → 400.
    - server/routes/documents.ts: check PNG/JPEG/WebP magic bytes on upload (else 415). Send `X-Content-Type-Options: nosniff` on the file stream and the public evidence photo stream.
    - server/routes/extract.ts: guard EXTRACT_TIMEOUT_MS with Number.isFinite. Keep a module-level Map<sha256, Promise> so concurrent extracts of the same file make one Gemini call.
    - server/routes/extras.ts CSV: use formatRM(sen).replace(/^RM/, '') instead of the local rm().
28. server/api.test.ts:
    - In the EXISTING INV-2291 test, after the counts assertions: GET /api/suppliers/sup_ali/ledger → expect payNowSen 96200; approve the Maggi short flag (request deduct); settle it `deducted` → expect payNowSen 87200. If later tests relied on the old state, change them to compare deltas.
    - Make the PO-number test month-independent: read the current po_seq setting first, expect seq+1 and seq+2.
    - Replace `if (ev.json.photos[0])` and `if (other)` with explicit expects.
    - Use parseRM instead of parseFloat * 100.

P3. CHEAP WINS (only while green; skip freely)
29. client/src/main.tsx:
    - wrap the app in <MotionConfig reducedMotion="user">;
    - a top-level ErrorBoundary showing common.error + reload;
    - a QueryCache onError: on ApiError 401, if !location.pathname.startsWith('/e/'), set ['me'] to null (back to login);
    - sonner toastOptions classNames { toast: 'rounded-2xl bg-ink text-white font-sans shadow-elev' }.
30. On home, flag-detail, supplier-detail, invoice-detail, count and einvoice: if the query errors, show an ErrorState (icon + common.error + a retry button calling refetch) instead of an endless skeleton; on 404 show flag.notFound.
31. client/src/components/ui/sheet.tsx: animate the content with motion using sheetSpring (no drag).
32. Add a back/close ghost button (top-left) on read, review, count and bon. Add an offline banner using common.offline (navigator.onLine + events). Empty states on flags, suppliers and orders get a CTA Link to /scan.
33. client/src/pages/review.tsx: make the document image sticky (sticky top-0 z-10 bg-bg, max 28dvh); tapping a box scrolls its row (id row-{i}) into view smoothly.
34. client/src/pages/invoice-detail.tsx:
    - payment controls and "Sahkan tepat" (when the server's canMarkCorrect is true);
    - "Lihat e-invois" when a draft exists instead of preparing again;
    - use the server's lineTotalSen instead of qty * unitPriceSen.
35. Wording in ms.ts/en.ts: sup.markPaid "Tandakan sudah dibayar"; sup.markCorrect "Sahkan tepat"; sup.state.correct "Tepat"; flags.tab.review "Perlu semakan".
36. Tokens and accessibility:
    - replace the raw hex colours in button.tsx and logo.tsx with tokens (add --brand-hover, --surface-2-hover, --notord-hover);
    - remove border-radius from :focus-visible in index.css;
    - define --safe-top and use it in the Page top padding;
    - tabular-nums on dates and counts;
    - alt text on every <img>;
    - the login keypad also accepts keyboard 0–9 and Backspace;
    - the 'open' status uses brand, not the price colour.

FINISH
1. Run `npm test`, `npm run typecheck` and `npm run build`; all must pass.
2. One App Testing pass at 390px with OWNER_PIN=1234 STAFF_PIN=5678 on the workflow:
   a. Settings → Set semula demo.
   b. Scan → Invois → upload fixtures/docs/invoice_borong_ali_INV-2291.png → boxes draw in → Semak & simpan (PO-2610-004 chip).
   c. Count: Maggi 10 → 8, attach fixtures/docs/bon_signed_DO-5512.png as the signed bon, Simpan → "2 perbezaan ditemui", RM110.00 rolls up.
   d. Maggi flag: Lulus (Tolak jumlah). Gula flag: Laporkan harga 2.80.
   e. Hantar → edit one word → Buka WhatsApp. The activity log shows no reminder.
   f. Copy the evidence link, open it logged out: branded page, pulsing line, signed bon.
   g. Maggi flag → Selesaikan → Nota kredit → lands on Borong Ali; Pay now rolls RM962.00 → RM872.00.
   h. Log in as staff: no owner buttons on a flag.
3. Reset the demo data again.
4. Update docs/PROGRESS.md honestly (verified vs not verified).
5. Your FINAL message must be exactly this format:
   DONE: <item numbers>
   SKIPPED: <item numbers with one-line reasons, or none>
   TESTS: <passed>/<total> · TYPECHECK: ok/fail · BUILD: ok/fail · DEPLOY SMOKE: ok/fail
   APP TEST: a ok/fail · b ok/fail · … · h ok/fail (one-line note per fail)
   NOT VERIFIED: <list>
```

## If the Agent stops early
Paste:
```text
Continue FIX ROUND 1 from the first item not yet done (check docs/DECISIONS_LOG.md and the code). Same anti-loop rules R1–R5. End with the FINISH report format.
```
