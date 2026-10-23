# Fix round 5: BACKEND GAPS (last backend round)

> Independently verified Round 4 (`d1e0d41`): 140/140 tests, four scenarios, money, limiter, CSRF, attach, superseded-send and evidence all correct. This round closes the last backend gaps and adds one tool to prove the Gemini key and model names on demo day. BACKEND ONLY. No UI, styling, copy or layout changes. Line references checked against `main` `d1e0d41`.
> **Pull first.** `shared/core` and `fixtures` stay untouched.

```text
FIX ROUND 5: BACKEND GAPS. Tepat Bill. Server-side only; do not touch client/src. Work in order; IDs go in your report.

RULES
R1. Max 2 attempts per item. Still failing → revert only that item, append `- <date> · SKIPPED · <ID> · <reason>` to docs/DECISIONS_LOG.md, move on.
R2. Change only what an item names. No new dependencies. Never edit shared/core/* (except importing from it), fixtures/*, or anything under client/.
R3. After each section run `npm test` and `npm run typecheck`; fix what you broke. Browser testing only at FINISH.
R4. Don't ask me anything, don't wait, don't stop before FINISH. Log choices in docs/DECISIONS_LOG.md.
R5. Order: B → T → FINISH.

═══ B. BACKEND ═══
B1 Carry a delivery "not ordered" flag to the invoice too (today only short_qty is carried, so the same item can appear twice).
   server/delivery-ctx.ts:103-113 `supersedeDeliveryFlags`: handle `short_qty` AND `not_ordered`. For not_ordered, match the new invoice-stage not_ordered flag to the open delivery-stage not_ordered flag by equal `sku`, else by equal normalised description (use `normalise` from shared/core; read the description from the invoice line / delivery line via `invoiceLineId` / `lineId`). Same rules as now: proposed → dismissed + superseded_by; open/disputed stay with superseded_by; settled untouched. Update the doc comment above it. Keep the caller unchanged except that it must now pass not_ordered flags too (find the call site in server/routes/orders.ts via grep `supersedeDeliveryFlags`).
B2 Sessions must die when a PIN changes. server/auth.ts:31-43: add a `v` claim to the JWT = first 16 hex chars of sha256(`${SESSION_SECRET}:${role}:${pinForThatRole}`) (node:crypto createHash; read the pins via getPins()). `signSession(role)` computes it; `readSession` rejects (returns null) when the claim is missing or differs from the current value. Existing cookies without `v` become invalid (acceptable: everyone logs in again once).
B3 Gemini self-check for demo morning. New owner-only route `POST /api/gemini-check` in server/routes/extract.ts (`requireAuth` + `requireCan('edit_supplier')`; there is no dedicated action, reuse it). It runs ONE tiny text-only `generateText` call (prompt 'ping', `maxOutputTokens` small, `maxRetries: 0`) against each of `MODELS.primary` and `MODELS.fallback` using the same `makeGemini(process.env.GEMINI_API_KEY)` and the existing `budget(model, 10_000)` wrapper, in parallel, and returns `{ ok: boolean, primary: { model, ok, ms, error? }, fallback: { model, ok, ms, error? } }` where `error` is the short message or HTTP status only (never the key). If GEMINI_API_KEY is missing → 200 `{ ok:false, error:'GEMINI_API_KEY not set' }`. It must NOT read or write the `extractions` cache, must NOT decrement checks_left, must NOT log an event. Rate limit: at most 1 call per 10 s per process (429 otherwise). No client change; the owner calls it with curl/devtools.
B4 /api/flags list cap: server/routes/counts.ts (or wherever `GET /flags` lives, grep `r.get('/flags'`) add `.limit(500)` after ordering newest-first, so a large DB cannot be loaded in one request. Same cap for the all-flags read in server/routes/home.ts (the `all` query used for the work lists, newest first). Money summaries must still see ALL invoice-stage flags: do not cap the query that feeds `last30Days`; only cap the lists. If you cannot separate them in one attempt, SKIP B4.

═══ T. TESTS (server/api.test.ts or server/scenarios.test.ts) ═══
T1 B1: invoice INV-2291-style flow where the delivery has a not_ordered flag for an item and the invoice flags the same item not_ordered → the delivery flag gets `supersededBy` = the invoice flag id; a settled delivery not_ordered flag is left untouched.
T2 B2: a cookie signed before a PIN change is rejected after getPins() returns a new owner PIN (set process.env.OWNER_PIN in the test, restore after); a freshly signed cookie works.
T3 B3: with no GEMINI_API_KEY → `{ ok:false }`; staff → 403; unauthenticated → 401; the route never touches the `extractions` table (count unchanged) and `checks_left` is unchanged. Use the existing gemini stub pattern; do not call the real API.
T4 Decimal box regression through the REAL path: POST /api/invoices with `box_2d` values like [10.4, 20.6, 100.2, 300.9] → 201 and the stored box is integers.
T5 sku minting through the API: POST /api/pos with a line "Gula perang 1kg" for a supplier that already has gula-pasir-1kg → the PO line sku is `gula-perang-1kg`.
T6 Races: two parallel POST /api/pos with the same brand-new supplier name → exactly one supplier row; two parallel approves of one flag → one 200 and one 409 with a single `flag.approve` event; two parallel identical POST /api/invoices → one 201 and one 409.
T7 B4 (only if not skipped): the Home summary numbers are identical with 600 extra dismissed flags inserted (proves the cap does not touch money).

═══ FINISH ═══
1. `npm test`, `npm run typecheck`, `npm run build`: all pass. `git diff <previous HEAD> -- shared/core fixtures client` must be empty.
2. Production smoke on a spare port (NODE_ENV=production … sh -c "npm run db:push || true; node dist/index.js"): /api/health shows seeded:true; POST /api/gemini-check as owner returns JSON (ok:false 'GEMINI_API_KEY not set' is fine without a key); a cookie from before the restart with a changed OWNER_PIN is rejected (401).
3. Settings → Set semula demo; run the four scenarios once at 390px exactly as in docs/PRD.md §12 (same expected numbers: RM285.60; Anggaran RM90.00; 2 perbezaan · RM110.00; Pay now RM962.00 → RM872.00). Nothing may regress.
4. Reset the demo data again. Update docs/PROGRESS.md ("Fix round 5"). Do not touch HANDOFF.md, README.md, docs/PRD.md or client/.
5. FINAL message in exactly this format:
   DONE: <IDs>
   SKIPPED: <IDs with one-line reasons, or none>
   TESTS: <passed>/<total> · TYPECHECK ok/fail · BUILD ok/fail · PROD SMOKE ok/fail
   APP TEST: scenarios 1–4 ok/fail (one-line note per fail)
   NOT VERIFIED: <list>
```

## If the Agent stops early
```text
Continue FIX ROUND 5 from the first ID not yet done (check docs/DECISIONS_LOG.md and the code). Same rules R1–R5. End with the FINISH report format.
```
