# Implementation notes (read with the PRD; these override it where they differ)

> These came from a dry run of building this repo as Replit Agent. Each one prevents a known loop or a failing check.

## Setup and wiring
1. **Exact deps** (`npm install --save-exact`; never `--force`; never downgrade vitest, ai or zod):
   - **Build:** vite 8.3.x, a version of `@vitejs/plugin-react` that supports vite 8.
   - **Styling:** `tailwindcss` 4.3.3 with `@tailwindcss/vite` and `tw-animate-css`. **No** `tailwind.config.*`, **no** `postcss.config.*`, **no** `tailwindcss-animate`.
   - **Replit plugins:** omit any `@replit/vite-plugin-*` that doesn't support vite 8.
   - **CSS:** `client/src/index.css` starts with `@import "tailwindcss"; @import "tw-animate-css";`, then `@theme inline { --color-bg: var(--bg); … }`.
2. **Scripts:**
   - `dev`: `TZ=Asia/Kuala_Lumpur tsx server/index.ts`
   - `build`: `vite build && esbuild server/index.ts --bundle --platform=node --format=esm --packages=external --outdir=dist`
   - `start`: `TZ=Asia/Kuala_Lumpur NODE_ENV=production node dist/index.js`
   - `db:push`: `drizzle-kit push --force` (non-interactive)
   - `seed`: `TZ=Asia/Kuala_Lumpur tsx server/seed.ts`
   - `typecheck`: `tsc -p tsconfig.json`
   - `test`: keep as is
3. **Config:**
   - Root `tsconfig.json`: moduleResolution Bundler, jsx react-jsx, include `client/src`, `server`, `shared`; paths `@/*` → `client/src/*`, `@shared/*` → `shared/*`. The Vite alias matches.
   - `drizzle.config.ts`: schema `./shared/schema.ts`, dialect `postgresql`, `DATABASE_URL`.
   - `.replit`: modules `nodejs-22`, `postgresql-16`; port 5000 → 80.
4. **Express 5:**
   - The wildcard is `app.get('/{*splat}', …)`, never `'*'`.
   - Order: mount `/api` routers, then an `/api` JSON 404, then the SPA fallback.
   - Dev: `createViteServer({ server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'custom' })` → `app.use(vite.middlewares)`. The fallback reads `client/index.html`, then `vite.transformIndexHtml`.
   - Prod: `express.static('dist/public')` + index fallback. `httpServer.listen(Number(process.env.PORT ?? 5000), '0.0.0.0')`.
   - Export `createApp(deps)` from `server/app.ts` (no listen) so tests can inject storage and gemini.
5. **Proxy and auth:**
   - `app.set('trust proxy', 1)`; `cookie-parser`.
   - Cookie `tb_session`: httpOnly, sameSite lax, secure in production.
   - jose: `new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('30d')`, key `new TextEncoder().encode(SESSION_SECRET)`.
   - PIN limiter keyed by `req.ip`, 5 wrong per minute; a success resets it.
   - Refuse to boot if `OWNER_PIN === STAFF_PIN`.
6. **Route guard order:** auth (401) → `can()` (403) → lookup (404). **In M1, register every owner route from PRD section 8 as a 501 stub behind its guard**, so the 403 check passes before the features exist.
7. **App Storage** (`server/storage.ts`, built in **M0**, because the seed needs it):
   - `import { Client } from '@replit/object-storage'; const c = new Client();`
   - `await c.uploadFromBytes(key, buf)`
   - `const r = await c.downloadAsBytes(key); if (!r.ok) …; const buf = r.value[0];`
   - `c.downloadAsStream(key)`, `c.exists(key)`
   - Create the bucket in the App Storage pane first.
   - Expose `put/get/stream/exists`, with a local-disk fallback in `.data/objects/` when the Client can't initialise (tests). Add `.data/` to `.gitignore`.
8. **Client bundle:** the client may only `import type { ExtractedDoc } from '@shared/core/extract'`. Values come from `@shared/core` (the barrel). `linesToSen` and `extractWithFallback` are server-only.
9. **Paths:** server code resolves fixtures with `path.resolve(process.cwd(), 'fixtures')`, never `__dirname`.
10. **shadcn:**
    - Write `components.json` yourself (style new-york, tailwind config "", css `client/src/index.css`, aliases `@/components`, `@/lib/utils`).
    - Then run `npx shadcn@latest add button card sheet tabs input badge skeleton --yes --overwrite`.
    - Never add `drawer` (vaul). If the CLI prompts, copy the component source by hand.
11. **zod 4:** use `drizzle-zod` ≥ 0.8 or hand-written zod 4 schemas. Errors live in `.issues`; use `z.flattenError(e)`. Never install zod 3.

## Data rules the PRD left implicit
12. **Uploads keep the cache working:** if the file is PNG or JPEG, its long edge is ≤ 1600px and it is ≤ 4 MB, upload the **original bytes unchanged**. Otherwise downscale. The server's sha256 always uses `cacheKey()` on the bytes it receives. The client sends `width`, `height` and `pageCount` as multipart fields; the seed reads them from the PNG IHDR. Reserve `aspect-ratio` on images so nothing shifts.
13. **Count defaults:** `PUT /counts` merges the body over defaults:
    - each matched invoice line → key `line:<lineId>` = invoice qty;
    - each PO-only sku → 0.

    So sending only `{ 'line:L1': 8 }` gives exactly the Maggi + Gula flags. `received_counts.key` holds `line:<lineId>` or a sku.
14. **Price-list snapshot:** on the first count save, store `invoices.price_list_snapshot jsonb` (the supplier's list before autofill). Every re-detection for that invoice (re-save, link-substitute, report-price) uses the snapshot. Autofill runs only on the first save. On re-detect, keep flags whose `(invoiceLineId, type)` already exists with status ≠ proposed; only proposed flags are replaced.
15. **Link-substitute:** learnAlias + persist → re-run `detectFlags` with the same `line:` counts → replace proposed flags. The count follows the line.
16. **Report-price:** valid only on a **proposed** price_change. `setAgreedPrice` on the snapshot and on `price_list`, re-run `detectFlags`, take that line's price_change result (amount, baseline, source `agreed`), then transition to open with request `agreed_price`. If no flag results, dismiss it.
17. **No PO ("Tiada PO"):** build an implicit PO from the invoice lines (sku = slug, orderedQty = qty, no price) for `detectFlags` only, so not_ordered can't fire for the whole bill. Store `po_id = null`; the adapter passes `poId: ''`.
18. **sku:**
    - `normalise(desc).replace(/ /g, '-')`; a duplicate within one PO gets `-2`.
    - Before minting a new sku, reuse an existing `price_list` sku for that supplier if `tokenOverlap ≥ 0.6`.
    - The stored `invoice_lines.sku` is display-only. When the owner changes a line's match, call `learnAlias`.
19. **Foreign money:**
    - Columns: `invoice_lines.unit_price_foreign_minor int` and `invoices.exchange_rate_bp int` (4.20 = 42000). No `numeric` columns.
    - MYR sen = `Math.round(foreignMinor * bp / 10000)`, computed **only** in `server/core-adapters.ts#toMyrSen`.
    - `prepareSelfBilled` gets the foreign minor units.
    - Display: `formatRM(minor).replace('RM', currency + ' ')`.
20. **Duplicate invoices:** `POST /api/invoices` returns 409 `{ code: 'duplicate_invoice', invoiceId }` when the supplier + invoiceNo already exist; the UI offers "Buka invois sedia ada" (Open existing invoice).
21. **Flag photos:** each flag gets `flag_photos` = the invoice document + the PO document + `photoDocIds`.
    - Kind map: po → `po`, invoice → `invoice`, delivery_note → `signed_bon`, photo → `photo_kind`.
    - Store `documents.invoice_id` (nullable) so count-screen photos persist.
    - `Photo.url` = `/api/public/evidence/<token>/photo/<documentId>`.
22. **Evidence siblings:** flags of the same invoice, status ∉ {proposed, dismissed}, with the same `sentAt`. Fields: `{ type, description, amountSen, status }` only. `/e/:token` renders outside the session guard (never calls `/api/auth/me`). Express sets `X-Robots-Tag: noindex` on `/e/*` HTML and on the API. Lazy-load the app routes.
23. **Sending:**
    - `POST /api/flags/sent { flagIds }` once, with the same timestamp for all.
    - Reminder: `GET /api/flags/:id/message?reminder=1` drafts over this flag + its sent siblings (still open or disputed), logs `flag.remind`, and hides the flag from "Perlu susulan" for 14 days after its last `flag.remind`.
24. **Message assembly:**
    - Flags are ordered by line position, then short → price → not_ordered.
    - `billedQty` = line qty; `receivedQty` = count; `agreedUnitSen` = `flag.baselineUnitSen`; `item` = line description.
    - `invoiceDate` = docDate ?? issuedAt, as DD/MM/YYYY.
    - `evidenceUrl` = (`PUBLIC_BASE_URL` ?? request origin) + `/e/` + the first flag's token.
25. **Default and allowed requests:**
    - short_qty: deduct* or send_missing
    - price_change: agreed_price* or deduct
    - not_ordered: collect_back* or deduct
    - Price decreases (RM0): Abaikan only, and they don't count in "{n} perbezaan".
26. **Role → action map:**
    - approve → `approve_flag`
    - dismiss → `dismiss_flag`
    - report-price → `set_agreed_price`
    - link-substitute → `approve_flag`
    - message and sent → `send_message`
    - dispute and reopen → `dispute_flag`
    - settle → `settle_flag`
    - payment → `mark_paid`
    - mark-correct → `mark_correct`
    - PATCH supplier and confirming foreign → `edit_supplier`
    - einvoice prepare and approve → `approve_einvoice`; release → `release_einvoice`
    - export → `export_csv`
    - reset → `edit_supplier`
    - creating a new supplier by name while saving a PO or invoice → `correct_extraction` (staff allowed)
27. **Boxes on fallback:** when the extraction model is Flash-Lite or manual, store `box = null`. Screens draw boxes only when `box != null`. Map `ExtractResult.model` 'primary'/'fallback' → `MODELS[...]` names.
28. **Timeout:** `Promise.race([extractWithFallback(...), timeout(45000)])` → `{ status: 'manual', reason: 'timeout' }`. A late result is still written to `extractions` (no second decrement). Don't edit core.
29. **Fixture picker:**
    - `GET /api/fixtures` lists `fixtures/docs/*.expected.json` whose docType matches; validate the name (no path traversal).
    - `use-fixture` re-points the document's `storage_key`, sha256, width and height to the fixture PNG (uploaded by the seed), so the boxes line up. Show the chip "Bacaan demo".
    - No checks decrement.
30. **checks_left:** the seed sets 50. Decrement by 1 on each successful non-cached Gemini read, floored at 0. Nothing is blocked at 0.
31. **Bon from /scan:** upload as kind `delivery_note` with no extract. A sheet asks "Untuk invois mana?" (Which invoice is this for?) and lists recent invoices. Attach it as `signed_bon` → open `/invoices/:id/count`.
32. **Reset and seed on the deployment:**
    - Reset is allowed when `NODE_ENV !== 'production' || DEMO_FIXTURES === '1'` (owner only).
    - With `SEED_ON_BOOT=1`, the server seeds on start if `suppliers` is empty.
33. **Seed recipe** (`server/seed.ts`):
    1. Truncate all tables in FK order.
    2. settings: `shop` (without pins), `checks_left` 50, `po_seq:<YYMM now>` = highest seeded sequence.
    3. Suppliers → price_list → aliases.
    4. POs (`ordered_at = now - daysAgo`, boxes by index from the fixture's expected.json when `fixture` is set).
    5. Upload every `fixtures/docs/*.png` (skip if it exists) + `extractions` (sha256 → expected.json, model `fixture`). Insert `documents` rows only for fixtures referenced by a PO or invoice.
    6. Invoices (`issued_at`, `due_at = defaultDueAt`, `paid_at`, foreign columns) + lines + received_counts (keys as given).
    7. Flags: merge `detectFlags` results with `seed.flags` by (invoiceLineId, type), with a random 16-byte hex token. Attach photos only if the documents exist (otherwise the evidence page shows "Tiada gambar").
    8. Events.
34. **Tests that touch the DB:**
    - Put them in `server/api.test.ts` using a separate Postgres schema `test` (`SET search_path`), in-memory storage, and a gemini stub that throws if called.
    - Wrap them in `describe.skipIf(!process.env.DATABASE_URL)`.
    - Never wipe the dev data App Testing uses.
35. **Money component:** `<Money sen animate?>`.
    - Static: `formatRM` split into `RM` (0.6em, `--ink-2`) + digits.
    - Animated: `<NumberFlow value={sen/100} locales="en-US" format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />` after the `RM` span. This is display only and the only permitted float.
36. **Images on iOS:** try `createImageBitmap(file, { imageOrientation: 'from-image' })`; on throw, decode via `<img>` → canvas.
37. **PDF:**
    - Load lazily: `const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;`
    - Render page 1 with `page.render({ canvas, viewport })` at scale `1600 / max(w, h)`.
    - Upload only the JPEG and store page_count.

## UI specs (exact)
38. **Read → review morph:** `/read/:id` keeps the rows. After the last row lands + 500 ms, a sticky "Semak & simpan" (Check & save) appears → `navigate('/review/{kind}/:id', { replace: true })`, with `layoutId="doc-image-<id>"` on the image. Manual entry = `/review/{kind}/new` with one empty row.
39. **Reading-moment timeline:**
    - Beam: a 2px `--brand` line with a 96px gradient tail (0 → 30% opacity), sweeping 1.6 s ease-in-out on a loop. Status text rotates every 1.8 s with a 200 ms crossfade.
    - **Minimum beam time 1.4 s, even on a cache hit.**
    - On result: the beam fades over 200 ms. Each box draws via stroke-dashoffset over 450 ms with a 120 ms stagger, while its row slides in (y 12 → 0).
    - After 12 s: "Masih membaca…" + the demo link. After 45 s: manual.
    - Reduced motion: no beam; skeleton rows; boxes fade in together over 150 ms.
40. **Home hero:**
    - Card bg `--ink`, text white, radius 20, padding 20, min-height 176px (the skeleton is the same size).
    - Row 1: "30 hari lepas" at 70% opacity.
    - Row 2: Ditanda (Flagged), Display 40 NumberFlow.
    - Row 3: a 2-column grid split by a hairline: Selesai (Settled) / Masih terbuka (Still open), Heading 20.
    - Empty state: "Belum ada aduan" (No complaints yet). Tap → `/flags`.
41. **Flag card:**
    - min-height 72, padding 16, radius 20.
    - Left: a 40px circle in the type's bg colour with a 20px icon (8px `--dispute` dot when a reminder is due).
    - Middle: description (2 lines max) + caption "Borong Ali · INV-2291 · 3 hari lalu".
    - Right: amount (Heading 20, `layoutId="flag-amt-<id>"`) above the status chip (`layoutId="flag-chip-<id>"`).
    - Press scale 0.98.
42. **Flag detail crop:** a container 100% × 220px, radius 20. With react-zoom-pan-pinch, call `zoomToElement('line-<lineId>', clamp(1, 4, 900 / (xmax - xmin)), 0)` after the image loads. Tap → full-screen viewer. No box → uncropped image + highlight the facts row.
43. **PIN screen:**
    - 4 dots 14px with gap 16; a 3×4 grid of 72px round keys (`--surface-2`), digits 28 semibold, plus a backspace key.
    - Auto-submits on the 4th digit.
    - Wrong PIN: x keyframes `[0,-10,10,-8,8,-4,4,0]` over 400 ms, `vibrate(12)`, then the dots clear.
44. **Bottom nav:**
    - Height 64 + safe area; surface at 85% opacity with blur and a top hairline; labels 12px, active in `--brand`.
    - Centre Scan button: a 60px `--brand` circle raised 16px, elevated shadow.
    - Flags badge: 18px, `--notord`.
45. **Count result card:**
    - Springs up from the bottom with a 48px icon circle.
    - Title "{n} perbezaan ditemui"; the RM rolls up from 0; a mini list of the flags; primary button "Lihat aduan" (View flags).
    - All correct: check morph + scale pop to 1.06.
46. **Skeleton:** `--surface-2` with a 1.2 s shimmer; appears only after 150 ms; same size as the final content.
47. **WhatsApp button:** `--wa` background with `--ink` 600-weight text + the WhatsApp glyph (white on green fails contrast).
48. **Wording:** dismiss = **"Abaikan aduan"**; the Selesai tab also lists dismissed flags (Diabaikan chip).
49. **Event actions:**
    - auth.login, document.upload, ai.read, ai.fixture
    - po.create, invoice.create, delivery.record_counts
    - flag.approve, flag.dismiss, flag.report_price, flag.link_substitute, flag.send_whatsapp, flag.remind, flag.dispute, flag.reopen, flag.settle.<kind>
    - invoice.mark_paid, invoice.mark_correct
    - supplier.update, einvoice.prepare, einvoice.approve, einvoice.release_stub
    - export.csv, demo.reset

    Each has an i18n `event.<action>` string.

## Milestone adjustments
- **M0** also builds `server/storage.ts` and `server/app.ts` (`createApp`).
- **M1:** the i18n scaffold + keys as screens appear; the check is login, nav and the 403 on the stub routes.
- **M6 split:** M6a = flag detail, crop and owner actions (approve, dismiss, report-price, link-substitute) and the staff view. M6b = message preview, WhatsApp, sent and reminder.
- **M8 split:** M8a = settle/dispute, supplier ledger and payments. M8b = home, reminders and activity.
