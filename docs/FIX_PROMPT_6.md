# Fix round 6: call sites for the hardened core (last Replit round)

> Claude fixed the golden core after an independent audit (commit `be6ce31`, 180/180 tests, 4 scenarios re-verified): pack-size-safe item matching (`sameSize`), Unicode-safe `normalise`, `receivedFromDelivery` splitting duplicate-sku lines, no zero-qty price flags, zero prices never become baselines, new `acceptPrice`, delivery-aware `draftMessage` (`docKind: 'delivery'`), stricter phone parsing, `supplierOverlap`. This round only wires the NEW core functions into the server and fixes two server-side overflow gaps. Line references checked against `main` `be6ce31`.
> **Pull first.** `shared/core` and `fixtures` stay untouched (read-only imports only).

```text
FIX ROUND 6: WIRE THE HARDENED CORE. Tepat Bill. Server logic only; the only client edits allowed are the two one-line import swaps in B5. No styling, copy or layout changes.

RULES
R1. Max 2 attempts per item. Still failing → revert only that item, append `- <date> · SKIPPED · <ID> · <reason>` to docs/DECISIONS_LOG.md, move on.
R2. Change only what an item names. No new dependencies. Never edit shared/core/* or fixtures/*; import the new functions from '../../shared/core' (the barrel). Money stays integer sen.
R3. After each item group run `npm test` and `npm run typecheck`; fix what you broke. Browser testing only at FINISH.
R4. Don't ask me anything, don't wait, don't stop before FINISH. Log choices in docs/DECISIONS_LOG.md.
R5. Order: B1 → B6, then T, then FINISH.

═══ B. SERVER ═══
B1 Price-decrease flags must not re-flag forever. server/flags.ts:116-119: the skip set (skus whose baseline must NOT be auto-filled) must contain only skus with an UP price flag: filter `d.direction !== 'down'` at :116 and add `eq(S.flags.direction, 'up')` to the open-flags query at :118. Result: after a supplier lowers the price, the next invoice at that price raises no flag.
B2 "Ini kenaikan biasa" must work when an agreed price or a PO price exists. server/routes/flag-actions.ts:5 and :99-108: import `acceptPrice` from the core barrel and, where the code now calls `autofillPriceList(c.priceNow, [{ sku, unitPriceSen }])`, use `acceptPrice(c.priceNow, row.sku!, row.invoiceUnitSen!)` instead (then `cleanPriceList` as today). `acceptPrice` sets BOTH `agreedSen` and `lastInvoiceSen`, so the `price_list` upsert at :108-109 must write both columns (`agreedSen: next2.agreedSen, lastInvoiceSen: next2.lastInvoiceSen`) in the insert values and in `set`; otherwise the old agreed price keeps winning. Extend the condition at :99 so dismissing a price DECREASE (`row.direction === 'down'`) also accepts the new price automatically (no `asInflation` needed for down); keep `asInflation` required for up. Log `{ asInflation }` as today (and `{ accepted: 'down' }` for the down case).
B3 Delivery-stage messages: server/routes/messages.ts `parentOf` (:25-31) already knows the flag stage. Pass `docKind: flag.stage === 'delivery' ? 'delivery' : 'invoice'` into `draftMessage(...)` (find the call by grep `draftMessage`), and for delivery flags pass the line's `amountSen` as stored (0 when no baseline; the core now omits unknown amounts and says "anggaran"/"estimate" otherwise). Do not change anything for invoice messages.
B4 Never merge different pack sizes when minting skus: server/core-adapters.ts:89 (`nearSku`): add `sameSize(description, text)` (core export) as an extra condition to the near-match; and client/src/pages/evidence.tsx:58 keep the `tokenOverlap >= 0.6` filter but also require `sameSize(line.description, l.description)` (import from '@shared/core').
B5 Supplier auto-pick must ignore company words: client/src/pages/review.tsx:103 and :122: replace `tokenOverlap(...)` with `supplierOverlap(...)` (core export; same arguments, same 0.6 threshold) and fix the import at :6. Nothing else in that file changes.
B6 Overflow guards (500s today): server/routes/orders.ts:23 `Sen = z.number().int().nonnegative().max(100_000_000)`; in POST /invoices (around :142-171) and POST /pos, after parsing, reject with ApiError(422, 'too_large', 'Jumlah terlalu besar') when any `qty * unitPriceSen` exceeds 2_000_000_000 or the summed total does (the int4 columns hold up to 2,147,483,647). Same check for foreign lines on the converted `toMyrSen` value.

═══ T. TESTS (server/api.test.ts or server/scenarios.test.ts) ═══
T1 B1: invoice 1 at RM2.80 (autofills), invoice 2 at RM2.50 raises one `down` info flag; dismiss it; invoice 3 at RM2.50 raises NO price flag.
T2 B2: supplier with an agreed price RM2.80; an invoice at RM3.20 raises an `up` flag; dismiss with `{ asInflation: true }`; the next invoice at RM3.20 raises no price flag. Repeat with a PO line price RM2.80 and no agreed price.
T3 B3: GET /api/flags/:id/message for the DELIVERY flag of scenario 2 (bon_signed_DO-5512) contains "bon penghantaran DO-5512" and "dalam bon 10, diterima 8" and does NOT contain "invois"; the INVOICE message for INV-2291 is byte-identical to the PRD §11 example (RM110.00 total).
T4 B4: a PO line "Minyak Masak 1kg" and an invoice line "Minyak Masak 5kg" for the same supplier → the invoice line becomes a `not_ordered` flag (not a price change), and minting does not reuse the 1kg sku.
T5 B6: POST /api/invoices with qty 100000 and unitPriceSen 100000000 → 422 `too_large`, not 500.
T6 The four scenarios and the exact Home figures (85.80 / 31.90 / 53.90) are unchanged (existing tests stay green).

═══ FINISH ═══
1. `npm test`, `npm run typecheck`, `npm run build`: all pass. `git diff <previous HEAD> -- shared/core fixtures` must be empty; the only client diff is the B4 evidence.tsx filter and the B5 review.tsx swap.
2. Production smoke on a spare port (NODE_ENV=production … sh -c "npm run db:push || true; node dist/index.js"): /api/health shows seeded:true.
3. Settings → Set semula demo; run the four scenarios once at 390px exactly as in docs/PRD.md §12 (RM285.60; Anggaran RM90.00; 2 perbezaan · RM110.00; Pay now RM962.00 → RM872.00). Nothing may regress.
4. Reset the demo data again. Update docs/PROGRESS.md ("Fix round 6"). Do not touch HANDOFF.md, README.md, docs/PRD.md or replit.md.
5. FINAL message in exactly this format:
   DONE: <IDs>
   SKIPPED: <IDs with one-line reasons, or none>
   TESTS: <passed>/<total> · TYPECHECK ok/fail · BUILD ok/fail · PROD SMOKE ok/fail
   APP TEST: scenarios 1–4 ok/fail (one-line note per fail)
   NOT VERIFIED: <list>
```

## If the Agent stops early
```text
Continue FIX ROUND 6 from the first ID not yet done (check docs/DECISIONS_LOG.md and the code). Same rules R1–R5. End with the FINISH report format.
```
