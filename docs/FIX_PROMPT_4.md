# Fix round 4: FINAL close-out (A–Z)

> Built from an independent Claude verification of Fix Round 3 (`8adfef5`): 131/131 tests, typecheck and build were re-run and pass; the four scenarios, the demo path and the money figures were driven in a real browser (Playwright, production build, 390px and 360px) and are CORRECT; three read-only code audits (functional, UI, deploy) found the defects below. Nothing here adds a feature. Every line reference was checked against `main` `8adfef5`.
> **Pull first.** No change to `shared/core` or `fixtures` is needed or allowed.

```text
FIX ROUND 4: FINAL CLOSE-OUT. Tepat Bill. The product works; this round removes the remaining integrity, wording and polish defects so the demo cannot embarrass us. Work strictly in order; IDs are referenced in your report.

RULES
R1. Max 2 attempts per item. Still failing → revert only that item, append `- <date> · SKIPPED · <ID> · <reason>` to docs/DECISIONS_LOG.md, move on. Never retry a skipped item.
R2. Change only what an item names. No new dependencies. Never edit shared/core/* or fixtures/*. Money comes from shared/core (formatRM / Money); display-only NumberFlow is the only float allowed.
R3. After each section (P0, P1, P2, P3) run `npm test` and `npm run typecheck` and fix what you broke. Browser testing happens only at FINISH.
R4. Don't ask me anything, don't wait, don't stop before FINISH. Log choices in docs/DECISIONS_LOG.md.
R5. Order: P0 → P1 → P2 → P3. P0 and P1 are must-do.
R6. Motion budget: no pulses, no stagger, no whileTap, no glows, no gradients, no shared-element (layoutId) moves. Only box draw-in (all boxes together), NumberFlow, sheets, the stamp thunk and the linear scan sweep.

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

═══ P1. WRONG OUTPUT SEEN ON SCREEN ═══
P1.1 Raw event codes on Home, Activity and flag history ("invoice.compare", "delivery.create"). Add to ms.ts and en.ts: `act.delivery.create` 'Penghantaran direkodkan' / 'Delivery recorded'; `act.invoice.compare` 'Invois dibandingkan dengan penghantaran' / 'Invoice compared with delivery'; `act.invoice.due_date` 'Tarikh jatuh tempo dikemas kini' / 'Due date updated'; `act.invoice.paid_date` 'Tarikh bayaran dikemas kini' / 'Payment date updated'. Check every `logEvent(` action string in server/ against the `act.*` keys and add any other missing one. In activity.tsx:16, home.tsx:113 and flag-detail.tsx:111 the fallback prints the raw code: print `t('act.unknown')` ('Aktiviti' / 'Activity') instead.
P1.2 Supplier page shows the delivery estimate next to the invoice flag, so RM90 looks doubled. client/src/pages/supplier-detail.tsx:46: `.then` / select only flags with `!f.supersededBy && f.status !== 'dismissed'` (apply the same filter wherever :106 renders the list).
P1.3 Home marks DO-5512 "TEPAT" after its short was carried to the invoice. server/routes/home.ts:36: state = 'issue' when any of its flags is proposed/open/disputed; else 'billed' when any flag has `supersededBy` (new state, chip label t('flag.broughtToInvoice')); else 'correct' when ownerMarkedCorrect or invoiceId; else 'waiting'. Update the client chip map for 'billed' (neutral tone) and the Orders tab if it maps states.
P1.4 Superseded delivery flag detail contradicts itself (stamp "DIABAIKAN" next to chip "DIBAWA KE INVOIS"; "Harga invois RM0.00"). client/src/pages/flag-detail.tsx:127: when `f.supersededBy`, render no Stamp; render a dashed-border note "Dibawa ke invois" with a link (min-h-11) to `/flags/${f.supersededBy}`. For `f.stage === 'delivery'`: label "Dalam invois" → new key `flag.inBon` 'Dalam bon' / 'On the bon' and hide the "Harga invois" row.
P1.5 `GET /invoices/:id/compare` says readyToPay for an invoice that was never compared. server/routes/counts.ts:125: `readyToPay: !!delivery && readyToPay(...)`.
P1.6 Float money in the UI: client/src/pages/compare.tsx:62 uses `refUnitSen / 100` (toFixed) → use `formatRM(r.refUnitSen)` from shared/core (barrel).
P1.7 Stamp thunk never plays. client/src/pages/flag-detail.tsx:87 `onMutate`: call `setJustStamped(true)` as the FIRST statement (before the optimistic status write), for approve, dispute and settle. Remove the later duplicates at :101-102 only if redundant. The 900 ms navigate at :101 gets a cleared timeout (store the id in a ref, clear in a useEffect cleanup).
P1.8 Compare column headers collide at 360px ("DIPESANDITERIMA"). client/src/pages/compare.tsx:49: replace the three headers with new language-neutral keys `compare.colPo` 'PO', `compare.colDo` 'BON' (en 'DO'), `compare.colInv` 'INV' (keep w-10 columns; keep the long labels as aria-labels).

═══ P2. POLISH (design bar: paper, ink, stamp; no template look) ═══
P2.1 Motion leftovers (R6): remove `layoutId` from flag-card.tsx:44,46 and flag-detail.tsx:127,137 (plain elements); remove the `layoutId` prop use in read.tsx:106 and the `layoutId` on doc-image.tsx:13; doc-image box draw-in uses delay 0 for all boxes (drop `stagger`); read.tsx:154 CTA bar: no spring slide (static, or a 150 ms opacity fade); login.tsx:24 wrong PIN: no shake; clear the dots and show the error line in `text-notord`, keep `navigator.vibrate`.
P2.2 One radius, no shadow: ui/sheet.tsx:16 remove `shadow-elev` and use `rounded-t-card` (delete `--radius-sheet` and `--shadow-*` tokens in index.css:20-21,53-55 once nothing references them; grep first). Skeleton `rounded-xl` → `rounded-card`.
P2.3 Error states: read.tsx (document query isError → ErrorState with retry instead of the endless Skeleton); review.tsx (suppliers or read query isError → ErrorState; if the read failed show the manual-entry note); home.tsx StaffHome (add ErrorState). flag-detail.tsx:123 and invoice-detail.tsx:51: pass `notFound` only on a 404, otherwise the generic error.
P2.4 Review accessibility and 360px: give every review input a name (`aria-label` or `htmlFor`): supplier name, invoice no., date, currency, rate, printed total, qty, unit, price. review.tsx:286: price/qty/unit inputs use `px-2` so "123.45" is not clipped at 360px.
P2.5 Tap targets ≥44px: supplier-detail.tsx:86 invoice link gets `inline-flex min-h-11 items-center`; :98 the due-date label and input `min-h-11`.
P2.6 Copy: scan.tsx:18 own hint key `scan.delivery.attachHint` 'Lampirkan pada invois yang sudah ada' / 'Attach to an existing invoice'; `count.done` 'Tutup' / 'Close'; flag-card.tsx:39 reminder dot `aria-label` = `t('flag.reminderCaption')`.
P2.7 Template-look: review.tsx:249 and :298 replace the pastel icon boxes with a plain `border-l-[3px]` note (type colour, text-ink, no icon, no bg-*-bg). einvoice.tsx Stamp tone follows status (draft = neutral, approved/released = ok).
P2.8 Alt text: flag-detail.tsx:159 use the `ev.kind.*` label, not the raw enum; line-crop.tsx:22 alt = the line description.

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
2. Production smoke on a spare port (NODE_ENV=production … sh -c "npm run db:push || true; node dist/index.js"): /api/health shows db/storage/gemini/demo/seeded; open `/` in the browser and confirm there are NO Content-Security-Policy console errors and the IBM Plex Mono / DM Sans fonts load.
3. Settings → Set semula demo. One App Testing pass at 390px (OWNER_PIN=1234 STAFF_PIN=5678 on the workflow) of the four scenarios exactly as in docs/PRD.md §12 (do_lim_brothers_DO-LB-0901 → tepat; invoice_lim_brothers_LB-7810 → INVOIS TEPAT · Sedia untuk dibayar RM285.60; bon_signed_DO-5512 Maggi 10→8 → "1 perbezaan · Anggaran RM90.00"; invoice_borong_ali_INV-2291 vs DO-5512 → "2 perbezaan · RM110.00"; Maggi Lulus Tolak jumlah; Gula Laporkan harga 2.80; Hantar; evidence logged out; Maggi Selesaikan Nota kredit → supplier Pay now RM962.00 → RM872.00). Extra checks this round: (a) Home Penghantaran shows DO-5512 as "Dibawa ke invois", not "Tepat"; (b) the supplier page lists no RM90 "Anggaran" row for DO-5512; (c) Activity shows no raw codes like "invoice.compare"; (d) the delivery flag detail has no stamp and links to the invoice flag; (e) at 360px the compare header reads PO · BON · INV without overlap.
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
