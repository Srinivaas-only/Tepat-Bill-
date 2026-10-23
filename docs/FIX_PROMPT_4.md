# Fix round 4: BACKEND + WORKFLOW close-out

> Built from an independent Claude verification of Fix Round 3 (`8adfef5`): 131/131 tests, typecheck and build were re-run and pass; the four scenarios, the demo path and the money figures were driven in a real browser (Playwright, production build, 390px and 360px) and are CORRECT; three read-only code audits (functional, UI, deploy) found the defects below. Scope decision (owner): BACKEND LOGIC AND WORKFLOW ONLY. UI/UX polish is deliberately deferred to a later round (Round 5); do not touch styling, motion, copy or layout in this round. Nothing here adds a feature. Every line reference was checked against `main` `8adfef5`.
> **Pull first.** No change to `shared/core` or `fixtures` is needed or allowed.

```text
FIX ROUND 4: BACKEND + WORKFLOW CLOSE-OUT. Tepat Bill. The product works; this round removes the remaining integrity, security and workflow-logic defects. Do NOT change UI styling, motion, copy or layout; only the client lines named below, and only for logic. Work strictly in order; IDs are referenced in your report.

RULES
R1. Max 2 attempts per item. Still failing → revert only that item, append `- <date> · SKIPPED · <ID> · <reason>` to docs/DECISIONS_LOG.md, move on. Never retry a skipped item.
R2. Change only what an item names. No new dependencies. Never edit shared/core/* or fixtures/*. Money comes from shared/core (formatRM / Money); display-only NumberFlow is the only float allowed.
R3. After each section (P0, P1, P2) run `npm test` and `npm run typecheck` and fix what you broke. Browser testing happens only at FINISH.
R4. Don't ask me anything, don't wait, don't stop before FINISH. Log choices in docs/DECISIONS_LOG.md.
R5. Order: P0 → P1 → P2. All are must-do.
R6. No UI/UX changes beyond the named client logic lines (P0.7, P0.8, P1.3 chip mapping). No new motion.

═══ P0. INTEGRITY + SECURITY ═══
P0.1 Staff can brute-force the owner PIN. server/routes/auth.ts:19 calls `limiter.reset(ip)` after any successful login, so 4 wrong guesses + one staff login restarts the count. Delete that line (and the "success resets" comment in server/auth.ts:45). Failures stay a per-IP sliding window of 5 per 60 s.
P0.2 A recount can delete or overwrite an approved flag. Both replace-proposed helpers act by id only:
     - server/flags.ts:91 and server/delivery-ctx.ts:75: `.where(and(eq(S.flags.id, old.id), eq(S.flags.status, 'proposed')))`.
     - server/flags.ts:97 and server/delivery-ctx.ts:81: delete with `.where(and(inArray(S.flags.id, staleIds), eq(S.flags.status, 'proposed'))).returning({ id: S.flags.id })`, and delete flag_photos only for the returned ids (move the flagPhotos delete AFTER it).
P0.3 Any bon can be attached to any invoice. server/routes/counts.ts:30: reject (409 bad_document) when `doc.deliveryId` is set; keep the existing invoiceId rule. At :31 make the update conditional: `.where(and(eq(S.documents.id, doc.id), or(isNull(S.documents.invoiceId), eq(S.documents.invoiceId, inv.id)))).returning(...)`; no row → 409 bad_document.
P0.4 Out-of-range numbers return 500. server/routes/orders.ts:72 `orderedAt` and server/routes/money.ts:64 `paidAt`, `dueAt`: add `.max(8.64e15)`.
P0.5 `POST /flags/sent` accepts superseded flags. server/routes/messages.ts:80-95: if any row has `supersededBy`, throw ApiError(409, 'bad_state', 'Aduan ini sudah dibawa ke invois').
P0.6 CSRF must survive a proxy that rewrites Host. server/app.ts:52: compute `const hosts = [req.get('host'), req.get('x-forwarded-host')?.split(',')[0].trim()].filter(Boolean)` and treat the Origin as bad only when its host is in neither. (Login on the deployed `.replit.app` URL must not 403.)
P0.7 Wrong delivery is auto-linked permanently. client/src/pages/review.tsx:134: default `effectiveDeliveryId` to `dcands.find(c => c.samePo)?.id ?? (dcands.length === 1 ? dcands[0].id : null)` instead of `dcands[0]?.id`. The chip and dropdown still let the owner choose; "Tiada penghantaran" is the default when unsure.
P0.8 Evidence page for DELIVERY flags (the supplier sees this):
     - client/src/pages/evidence.tsx:59: pick the highlighted photo by the right kind: for a delivery flag (the `bon` flag already used at :83) the delivery's own document (check what `attachDeliveryPhotos` in server/delivery-ctx.ts stores as `kind`, likely `signed_bon` or `delivery`); for an invoice flag keep `invoice`. The highlight section must render for both.
     - :78 and :91: when `bon`, do not show "× RM0.00": show only the quantity. (server/routes/evidence.ts:34 sets `unitPriceSen: 0` for delivery lines; leave the server, fix the render.)
P0.9 /api/health must expose seed state: add `seeded: <count of suppliers > 0>` to the JSON in server/app.ts (keep `ok`, `db`, `storage`, `gemini`, `demo` unchanged).

═══ P1. WRONG DATA / WORKFLOW STATE ═══
P1.2 Supplier page shows the delivery estimate next to the invoice flag, so RM90 looks doubled. client/src/pages/supplier-detail.tsx:46: `.then` / select only flags with `!f.supersededBy && f.status !== 'dismissed'` (apply the same filter wherever :106 renders the list).
P1.3 Home marks DO-5512 "TEPAT" after its short was carried to the invoice. server/routes/home.ts:36: state = 'issue' when any of its flags is proposed/open/disputed; else 'billed' when any flag has `supersededBy` (new state, chip label t('flag.broughtToInvoice')); else 'correct' when ownerMarkedCorrect or invoiceId; else 'waiting'. Update the client chip map for 'billed' (neutral tone) and the Orders tab if it maps states.
P1.5 `GET /invoices/:id/compare` says readyToPay for an invoice that was never compared. server/routes/counts.ts:125: `readyToPay: !!delivery && readyToPay(...)`.


═══ P2. MORE BACKEND INTEGRITY ═══
P2.1 Duplicate suppliers on a race: server/routes/orders.ts:36-41 `resolveSupplier` selects by name then inserts. Run the select+insert inside one transaction that first takes `select pg_advisory_xact_lock(hashtext('supplier:' || lower($1)))` (use the trimmed name), so two parallel new-supplier saves yield one row.
P2.2 Timezone: wrap the date in `kl()` from server/core-adapters.ts for `poNumber(...)` at server/routes/orders.ts:80 and :89 and server/seed.ts:44, so PO numbers do not depend on the host TZ.
P2.3 `/api/health` must not 500 when the DB is down: in server/app.ts return 503 `{ ok:false, db:false, ... }` from a try/catch around the DB ping.
P2.4 Boot safety: server/index.ts must `console.error` and keep serving (not exit) when the unique-index push or seed fails, and log once at boot whether `OWNER_PIN`/`STAFF_PIN` are exactly 4 digits (it already exits on invalid, keep it, but make the message name the variable).

═══ P3. TESTS (server/api.test.ts, server/scenarios.test.ts) ═══
T1 Limiter: 4 wrong PINs, then a correct staff login, then a wrong PIN → the 5th failure is blocked (429).
T2 Recount race: approve a proposed flag, then PUT counts again with the same counts → that flag still exists with the same id/token and status 'open'.
T3 Attach: a delivery's own document → POST /documents/:id/attach to another invoice → 409.
T4 `POST /flags/sent` with a superseded delivery flag → 409.
T5 Compare: an invoice with no linked delivery → `readyToPay === false`.
T6 Exact home summary for the fresh seed: `{ flaggedSen: 8580, settledSen: 3190, openSen: 5390 }` (replace the loose bounds in scenarios.test.ts).
T7 Staff 403: invoice mark-correct, einvoice release. T8 use-fixture on a document already used → 409 document_in_use (set DEMO_FIXTURES=1 inside the test). T9 After POST sent {reminder:true}, `reminderDue` is false.
T10 CSRF: POST with `Origin: https://x.example` and `Host: internal`, `X-Forwarded-Host: x.example` → passes; Origin `https://evil.example` → 403.

═══ FINISH ═══
1. `npm test`, `npm run typecheck`, `npm run build`: all pass.
2. Production smoke on a spare port (NODE_ENV=production … sh -c "npm run db:push || true; node dist/index.js"): /api/health shows db/storage/gemini/demo/seeded; open `/` in the browser and confirm there are NO Content-Security-Policy console errors.
3. Settings → Set semula demo. One App Testing pass at 390px (OWNER_PIN=1234 STAFF_PIN=5678 on the workflow) of the four scenarios exactly as in docs/PRD.md §12 (do_lim_brothers_DO-LB-0901 → tepat; invoice_lim_brothers_LB-7810 → INVOIS TEPAT · Sedia untuk dibayar RM285.60; bon_signed_DO-5512 Maggi 10→8 → "1 perbezaan · Anggaran RM90.00"; invoice_borong_ali_INV-2291 vs DO-5512 → "2 perbezaan · RM110.00"; Maggi Lulus Tolak jumlah; Gula Laporkan harga 2.80; Hantar; evidence logged out; Maggi Selesaikan Nota kredit → supplier Pay now RM962.00 → RM872.00). Extra checks this round (logic only): (a) Home Penghantaran shows DO-5512 as 'Dibawa ke invois', not 'Tepat'; (b) the supplier page lists no RM90 'Anggaran' row for DO-5512; (c) an invoice saved without a linked delivery never shows 'Sedia untuk dibayar'; (d) logging in as staff after 4 wrong owner-PIN guesses does not unlock further guesses; (e) /api/health shows seeded:true.
4. Reset the demo data again.
5. Update docs/PROGRESS.md ("Fix round 4": verified vs not). Do not touch HANDOFF.md, README.md or docs/PRD.md.
6. FINAL message in exactly this format:
   DONE: <IDs>
   SKIPPED: <IDs with one-line reasons, or none>
   TESTS: <passed>/<total> · TYPECHECK ok/fail · BUILD ok/fail · PROD SMOKE ok/fail
   APP TEST: scenarios 1–4 ok/fail · extras a–e ok/fail (one-line note per fail)
   NOT VERIFIED: <list>
```

## If the Agent stops early
```text
Continue FIX ROUND 4 from the first ID not yet done (check docs/DECISIONS_LOG.md and the code). Same rules R1–R6. End with the FINISH report format.
```
