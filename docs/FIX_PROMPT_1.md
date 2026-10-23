# Fix round 1 (from the Claude Code review of commits bc45272..0d28024)

> Paste the block below into Replit Agent (Build mode). Pull from GitHub first: this round assumes the `shared/core/extract.ts` box-schema fix (commit after 0d28024) is in your workspace.

```text
Fix round 1 for Tepat Bill. A full code review of your M0–M10 build found demo-breaking bugs, deployment blockers and gaps against PRD/IMPLEMENTATION_NOTES. Work through the sections IN ORDER (P0 first). Same rules as always: replit.md, docs/PRD.md and docs/IMPLEMENTATION_NOTES.md apply; shared/core and fixtures stay read-only; no money arithmetic outside shared/core; don't ask me questions (log choices in docs/DECISIONS_LOG.md). After each section: npm test + npm run typecheck must be green. Then continue.

P0-A. GEMINI (core is fixed now)
1. shared/core/extract.ts now uses a plain 4-number array for box_2d (no z.tuple), rounds/clamps boxes in linesToSen, and falls back to Flash-Lite on NoObjectGeneratedError too. Delete the workaround in server/gemini.ts: call extractWithFallback from shared/core directly (keep the timeout race, the cache and the checks_left logic in routes/extract.ts). Update the DECISIONS_LOG entry.

P0-B. DEMO BREAKERS
2. read.tsx: show "Guna bacaan demo" (when DEMO_FIXTURES is on) not only during reading/manual, but ALSO under the rows after any successful read whose model is not 'fixture' (most important when no line has a box, i.e. a Flash-Lite read). Lower the "Masih membaca" + demo-link delay from 12 s to 7 s. Add a fixtureChosen ref: once a fixture is chosen, ignore any late live/timeout result. Keep the beam mounted for 200 ms with fading=true when the result arrives (notes #39). Add a client-side 45 s fallback to manual.
3. message-sheet.tsx and flag-detail.tsx: a first send currently logs a FALSE flag.remind. The sent mutation refetches the flag, sentAt flips the `reminder` prop to true and the sheet refetches ?reminder=1. Fix: capture `reminder` once when the sheet opens (useState initialised on open) and keep it out of live props. Close the sheet in the WhatsApp onClick. The server returns reminderDue (needsReminder) on GET /flags/:id. Show "Hantar peringatan" only when reminderDue; otherwise show an ok chip "Dihantar {DD/MM/YYYY}" plus a secondary "Hantar semula".
4. count.tsx: disable "Simpan kiraan" while a photo upload is pending (save.isPending || photo.isPending). Remove `capture` from the signed-bon input so a saved photo can be picked (keep capture on the delivery photo). Make the flag rows in the result sheet tappable Links to /flags/:id.
5. server/flags.ts replaceProposedFlags: re-detection currently deletes and re-inserts proposed flags, so ids and tokens change and an open /flags/:id page 404s after Pautkan or a count re-save. Instead, update proposed rows whose (invoiceLineId, type) still exists IN PLACE (keep id and evidence_token), insert new ones, and delete only unmatched proposed rows. After link-substitute, navigate to the resulting flag if one exists, else to /flags.
6. review.tsx live-read hardening: currency "RM", "RM " or empty → "MYR" before looksForeign or saving; drop docDate unless it matches ^\d{4}-\d{2}-\d{2}$; show clear BM toasts for 422 po_supplier_mismatch ("Pesanan ini milik pembekal lain") and 409 duplicate_invoice (offer "Buka invois sedia ada").

P0-C. DEPLOYMENT BLOCKERS
7. Reset on the deployment: server/routes/extras.ts must allow POST /api/dev/reset when NODE_ENV !== 'production' OR DEMO_FIXTURES === '1' (owner only). /api/checks returns { demo: boolean } and settings.tsx shows "Set semula demo" when demo is true (not import.meta.env.DEV). Use a confirmation sheet, not window.confirm.
8. Reset must NOT truncate `extractions` (keep the read cache; inserts already use onConflictDoNothing). Wrap the seed in db.transaction. seed docDate uses local Y-M-D parts (not toISOString). seed.json exchangeRateToMYR 4.2 → compute bp only in core-adapters (or hard-code 42000 there); no float math in seed.
9. server/index.ts: at boot in production, refuse to start with a clear message if SESSION_SECRET is missing or shorter than 32 characters, or if OWNER_PIN/STAFF_PIN are missing or equal (call the same getters login uses).
10. .replit deployment: run = ["sh", "-c", "npm run db:push && npm run start"] so the production DB gets the schema; keep build = npm run build. Remove the unused 5055→3000 port. With SEED_ON_BOOT=1 the first boot seeds.
11. server/storage.ts: `new Client()` never throws, so the disk fallback never kicks in and uploads 500 off Replit. Make storage lazy: on first use, probe once with `await client.exists('__probe__')`; if it throws or returns !ok, switch to diskStorage() and log a warning. Also honour STORAGE_DRIVER=disk.

P1. THE MONEY SHOT + KEY SCREENS (judges look here)
12. supplier-detail.tsx: make Pay now (payNowSen) the hero: <Money sen={payNowSen} animate/> at Display 40/44 bold. Below it, a 3-column grid of animated <Money>: Dipertikai (disputedSen), Kredit pembekal (creditCarrySen, label "Pembekal berhutang {rm} kepada anda" when > 0), Baki penyata dijangka (owedSen).
13. The roll RM962.00 → RM872.00 must be visible. flag-detail.tsx: prefetch ['ledger', f.supplierId] (add supplierId to the client type) when the flag loads. After a successful settle, navigate to /suppliers/:supplierId, so the cached 962 rolls to 872. On settle, approve, dismiss, report-price, link-substitute and count save, invalidate ['flag', id], ['flags'], ['invoice', invoiceId], ['invoices'], ['ledger', supplierId], ['ledgers'] and ['home'], awaiting the invalidations.
14. home.tsx: animate Selesai and Masih terbuka (Money animate). Hero per notes #40: bg-ink (not brand), min-h 176px, label "30 hari lepas" at 70% opacity, Ditanda at Display 40/44 bold, bottom 2-column grid with a hairline divider (divide-x divide-white/15) at Heading 20, a subtle radial brand highlight in the corner, tap → /flags, empty state "Belum ada aduan". Staff home: a big "Rekod penghantaran" CTA → /scan plus today's invoices; owner-only lists hidden. Owners also get supplier credit chips and the last 5 activity items.
15. count.tsx result: the total comes from the server (PUT counts returns totalSen computed with core; remove the client reduce). Roll it up from 0: start at 0, set the real value after 250 ms, <Money animate>. Steppers 56px round (h-14 w-14), number 28px, long-press repeat (start after 400 ms, then every 120 ms), select-on-focus. Changed lines glow (ring-2 ring-short bg-short-bg/40) with a Badge "−N". PO-only lines opacity-60 bg-surface-2.
16. bottom-nav.tsx: live flags badge = needs-action + follow-up counts from the ['home'] query (currently never shown).
17. flag-detail.tsx: hide the bottom nav on /flags/:id. Put the primary actions in a sticky blurred bottom bar (bg-surface/85 backdrop-blur-xl, border-t, safe-area padding): Lulus + Abaikan when proposed; Hantar + Pertikai + Selesaikan when open/disputed. Settle choices go in a bottom Sheet. buzz(12) on approve and settle. For staff on a proposed flag, show the owner.only chip "Menunggu kelulusan pemilik" with a Clock icon. Add: the baseline source chip (Badge tone price), PO and invoice numbers as links, the supplier policy note (server adds policyNote + this flag's events to GET /flags/:id), an event timeline, "Asingkan" on the substitute card, and the Tag icon for price.
18. message-sheet.tsx: an editable textarea (seeded from the drafted text) inside a WhatsApp-style chat bubble: surface-2 wallpaper, white bubble, rounded-2xl rounded-tr-sm tail, time stamp. Build the link on the client with waLink(text, phone) from @shared/core, so edits are sent. Copy copies the edited text. BM/EN segmented control.
19. evidence.tsx (the judge sees this on their own phone):
    - a branded header (Logo + "Bukti · Tepat Bill"), shop and supplier names, a status Badge, and the invoice docDate (server adds invoiceDocDate; fall back to issuedAt);
    - use the .hl-pulse SVG box instead of animate-pulse, and keep the highlight in the zoom viewer (PhotoViewer takes a box prop);
    - a PO-line vs invoice-line comparison using the existing ev.* keys; alt "Invois {no}"; aspect-ratio from width/height; the evidence.readOnly footer.
20. flag-card.tsx (notes #41): status chip, relative age, 8px dispute dot when reminderDue, layoutId flag-amt-{id} / flag-chip-{id} shared with the flag-detail header, press scale 0.98. flags.tsx: 4 tabs (Perlu semakan · Terbuka · Dipertikai · Selesai, with Selesai including Diabaikan) with counts.

P2. SERVER CORRECTNESS
21. flags.ts no-PO path: implicit PO sku = aliases[supplier][normalise(desc)] ?? an existing price_list sku with tokenOverlap ≥ 0.6 ?? minted slug (notes #18). Otherwise aliased lines raise a false not_ordered.
22. flag-actions.ts report-price: if re-detection yields no flag or amountSen === 0, dismiss instead of opening.
23. flags.ts autofill: skip every sku with an unresolved price flag, not only direction 'up'.
24. orders.ts POST /pos: reject a document already used by another PO (as the invoice path does).
25. Event names per notes #49: money.ts logs invoice.mark_paid / invoice.mark_unpaid and flag.settle.<settlement>. Add i18n act.* keys (ms + en) for EVERY logged action, including ai.read, ai.fixture, einvoice.prepare, einvoice.approve, einvoice.release_stub, export.csv and demo.reset. activity.tsx groups by day with sticky headers and role avatars.
26. app.ts error handler: pass through 4xx status from body-parser and others; Multer LIMIT_FILE_SIZE → 413, other Multer codes → 400; guard res.headersSent.
27. Small items:
    - messages.ts: de-duplicate flagIds; all flags must share one invoice (else 400).
    - orders.ts PATCH with an empty body → 400.
    - documents.ts: check PNG/JPEG/WebP magic bytes; send X-Content-Type-Options: nosniff on the file and evidence-photo streams.
    - extract.ts: guard EXTRACT_TIMEOUT_MS with Number.isFinite; add an in-flight Map<sha256, Promise> so a double tap makes one Gemini call.
    - Mount requireAuth once in createApp for /api, except /api/auth/* and /api/public/*.
    - extras.ts CSV: use formatRM(sen).replace(/^RM/, '') instead of the local rm().
28. api.test.ts:
    - Add a fresh-schema test: upload INV-2291 against PO-2610-004 with counts {line:L1: 8} → supplier sup_ali payNowSen === 96200; settle the Maggi flag as deducted → 87200.
    - Make the PO-number test month-independent (read po_seq first, expect +1).
    - Replace the conditional assertions (if (ev.json.photos[0]), if (other)) with explicit precondition expects.
    - Use parseRM instead of parseFloat * 100.

P3. SYSTEM POLISH (do as many as possible; stop if credits run low)
29. main.tsx:
    - MotionConfig reducedMotion="user";
    - a top-level ErrorBoundary;
    - a QueryCache onError that sends a 401 to /login;
    - sonner styled (rounded-2xl bg-ink text-white shadow).
    - On every query page, replace "no data = skeleton forever" with an ErrorState (icon + common.error + retry) and flag.notFound on 404.
30. sheet.tsx: motion spring (sheetSpring) with drag-to-dismiss.
31. A back/close button on read, review, count and bon. An offline banner (common.offline). Empty states with a small inline SVG illustration + CTA ("Imbas invois") on flags, suppliers and orders.
32. review.tsx: the image sticky at the top (max 28dvh); tapping a box scrolls its row into view (rows get id row-{i}); keep the same ['doc', id] query key as read.tsx; prefetch the review chunk from read.tsx and seed the ['extract', id] cache so the read→review morph doesn't re-POST or flash.
33. invoice-detail.tsx: payment controls + "Sahkan tepat" (server canMarkCorrect); "Lihat e-invois" when a draft exists. Remove the client qty*price (the server returns lineTotalSen).
34. Wording (ms + en): sup.markPaid "Tandakan sudah dibayar"; sup.markCorrect "Sahkan tepat"; sup.state.correct "Tepat"; flags.tab.review "Perlu semakan".
35. Tokens and accessibility:
    - replace the raw hexes in button.tsx, logo.tsx and index.css with tokens (add --brand-hover, --surface-2-hover, --notord-hover);
    - text-brand-ink instead of text-white;
    - remove border-radius from :focus-visible;
    - define --safe-top and use it in the Page top padding;
    - tabular-nums on every date and count;
    - alt text on every image;
    - the login keypad accepts keyboard digits and Backspace;
    - "Open" status uses brand, not price purple;
    - rename the self-referencing --shadow-card var.

FINISH
- Run npm test, npm run typecheck and npm run build.
- Short App Testing pass at 390px:
  1. Scan the INV-2291 fixture → boxes draw in.
  2. Count Maggi 8 → "2 perbezaan ditemui · RM110.00" rolls up.
  3. Approve Maggi, then Laporkan harga RM2.80 on Gula.
  4. Open the message, edit it, open WhatsApp → no false reminder in the activity log.
  5. Open /e/<token> logged out → branded page with a pulsing line and the signed bon.
  6. Settle Maggi with Nota kredit → lands on the supplier page and Pay now visibly rolls RM962.00 → RM872.00.
- Update docs/PROGRESS.md honestly: what's verified vs not (real phone wa.me, live camera read, Lighthouse, real handwritten bons).
```
