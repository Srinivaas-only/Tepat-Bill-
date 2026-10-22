# Tepat Bill: Tech Stack (final, all decisions made)

> SDC Hackathon 2026 · Domain 2 · Orbyte Smart SME Challenge
> Built from `SPEC_TepatBuild.md` (what we build) and the 11-slide deck (what judges are told). **Gemini is the only AI provider.**
> Verified 2026-10-22 by three independent agent passes: live fact-check, hostile red-team (all 35 user stories and 11 slides), and an empirical build (43/43 rule tests, Next 16 production build passing).

## Architecture in one sentence

A mobile-first Next.js 16 app on Vercel. Staff photograph the invoice and type the counts; **Gemini 3.8 Flash** reads every line and returns where on the page it read it; a pure-TypeScript integer-sen rules engine (never the AI) computes every RM flag; the owner approves; and one tap opens WhatsApp with a factual message linking to an evidence page where the supplier sees the exact line highlighted.

---

## 1. Frontend & UI

| Tool | Why judges care |
|---|---|
| **Next.js 16.4 (App Router) + React 19** | One app serves the owner's phone UI and the supplier's no-login evidence page. |
| **Tailwind CSS 4 + shadcn/ui**, deck palette (navy `#13254A`, blue `#2457D6`) | The product looks exactly like the deck judges just saw. |
| **`motion` 14** (`motion/react`): RM count-ups on home, flag-card entrance, status-chip morph | Money moving on screen *is* the pitch; three animations only. |
| **Two upload buttons: "Snap photo" (`capture="environment"`) and "Upload file" (`accept="image/*,application/pdf"`, no `capture`)** | One-tap camera for bons, plus file pick for WhatsApp screenshots and PDFs (story 4). (`capture` alone blocks file pick on phones.) |
| **Client prep: images downscaled to JPEG at 1600px long edge; PDFs rasterised page-by-page with `pdfjs-dist` to JPEG** | Every document becomes an image, so bounding boxes work on PDFs too, and no file ever hits Vercel's 4.5 MB body limit. |
| **Direct upload to Supabase Storage via signed upload URL** | The server only ever receives a storage path. |
| **SVG bounding-box overlay** on the document image | The proof layer of the wow factor (section 4). |
| **Bahasa Malaysia–first UI with EN toggle** (plain JSON dictionary); supplier message drafts in **BM or EN** | Built for kedai runcit owners and their suppliers. |

## 2. Backend & AI Engine (Gemini only)

| Tool | Why judges care |
|---|---|
| **Vercel AI SDK 7** (`ai` + `@ai-sdk/google`), `generateText({ output: Output.object({ schema }) })` | Typed, validated extraction; `generateObject` is deprecated. |
| **Zod 4 schemas** shared by AI output, DB writes and forms; **flat schema** (lines array of primitives + `box_2d`) | A misread like "2.5 cartons" is rejected before any rule runs; flat schemas avoid Gemini "invalid argument" errors. |
| **Primary: `gemini-3.8-flash`** with `thinkingConfig: { thinkingLevel: 'low' }`, `mediaResolution: 'MEDIA_RESOLUTION_HIGH'` | Current GA Flash, native `box_2d`, strong handwriting reads, low latency. |
| **Fallback: `gemini-3.5-flash-lite`**, only on HTTP 429 / 5xx | Gemini-only resilience: limits are per model per project. |
| **SHA-256 extraction cache** + **pre-extracted demo fixtures** + **manual entry/correct form** | Re-runs cost zero requests (spec); the demo survives any quota or network failure; the owner can always correct a misread. |
| **Billing-enabled Gemini key (Tier 1) for real-bon testing and demo day**; free key for development | The free tier is about 20 requests/day on Flash. Paid costs about RM0.03 per document (about RM5 for the whole hackathon) and keeps the data out of training. |
| **Pure-function rules + ledger engine** (TypeScript, integer sen) | The AI never does arithmetic; every RM figure is reproducible and tested. |
| **Template message drafter (BM/EN)**: every number is injected from the rules engine | Factual, no demands or legal wording (spec). |
| **Item matching:** per-supplier alias table (learned from owner corrections) → normalised token overlap ≥ 0.6 | "MILO TIN 1KG" ↔ "Milo 1kg" with no extra AI call. |
| **`wa.me/60…?text=`** (or `wa.me/?text=` when there's no supplier number) + **"Copy message"** button | The owner taps send themselves; nothing is auto-sent (spec + deck slide 8). |

### Documents and matching

- **PO:** the owner uploads their notebook page or WhatsApp order. Gemini reads it, the owner corrects, and it gets auto-numbered `PO-YYMM-###` (stories 1–3).
- **Invoice → PO suggestion:** score = supplier name match + item overlap + nearest date. Show the top pick with a dropdown to override (stories 6–7).
- **Foreign supplier detection:** Gemini extracts `currency` and `supplier_country`. If either is not MYR / MY, the app suggests "Foreign supplier" and the owner confirms (deck slide 5).
- **Evidence photo types:** delivery photo, **signed bon** (owner wrote "8 received" before signing; story 9), invoice, PO. The app reads the bon and invoice; delivery photos are stored as evidence, and **the app never counts stock from photos**.
- **Supplier record:** name, WhatsApp number (`60…`, no `+`), foreign flag, optional **return/credit policy note** shown on the flag screen (story 32).

### Flag rules (deterministic; the owner confirms every flag)

1. **Short quantity:** received < invoice qty → `(invoice qty − received) × invoice unit price`. If the invoice bills only what was received, there is **no money flag**, even when received < PO qty.
2. **Price change:** baseline = **owner-agreed price → PO line price (if the order states one) → last invoice price → none**.
   - With no baseline (a supplier's first invoice), there is no flag and the price becomes the baseline.
   - Increase: `(invoice price − baseline) × received qty`.
   - Decrease: shown for information at RM0.
   - Dismissing a change as inflation updates the baseline. Reporting it keeps the owner's agreed price, which the message states (stories 13–15).
   - Auto-fill never overwrites an agreed price and skips lines with an open or disputed price flag.
3. **Short + price on the same line:** shortage at invoice price on the missing units, plus price impact on received units only. Together = billed − received × baseline, so nothing is double counted (property-tested).
4. **Not ordered (wrong item):** an invoice line with no PO match → flag, amount = qty × price. The request is "collect back / don't charge".
   - **Substitution guard:** if an unmatched line appears and a PO line received 0 on the same invoice, show one **"Substituted?"** card. Link them (one price-difference flag) or split them (two flags).
5. Damaged and expired goods: roadmap slide (spec).

Shortage request options: **"Send the missing items"** or **"Deduct the amount"** (story 16).

### Lifecycle and money

- **Flag status:** `Proposed` (awaiting owner) → `Open` (owner approved) or `Dismissed`; `Open ↔ Disputed`; `Open/Disputed → Settled`. `Settled` and `Dismissed` are final. Staff can create Proposed flags; **only the owner** approves, dismisses, settles or disputes.
- **Settled as:** `Redelivered` (short qty only; owed unchanged because the invoice stands), `Credit note` or `Deducted` (both reduce owed). A credit note covers the full flag amount.
- **Order status:** `Recorded → Has flags → Correct`. Correct needs zero Open/Disputed flags **and** an owner tap (deck slides 4 and 8).
- **Payment status:** each order is `On credit` (due date +90 days, editable) or `Paid`.
- **Amount owed per supplier** = unpaid on-credit invoice totals − their settled credit notes/deductions − supplier credit applied. It is floored at RM0.
  - A credit note or deduction settled **after** an order is Paid becomes **supplier credit**, applied to the next unpaid invoices. Any remainder shows as "Supplier owes you RM X" and carries forward.
  - Disputed amounts stay owed; the app never assumes the owner is right.
  - The display is split: **"Pay now RM A · Under dispute RM B"**.
- **Expected statement balance** on each supplier page: what the supplier's month-end statement *should* bill. This hits deck slide 2's interview finding that "the statement can still bill" deducted items.
- **Follow-up reminder:** shown when a flag is `Open` or `Disputed` and 14 or more days have passed since the WhatsApp button was tapped. Computed at render, no cron. Seed one 15-day-old flag for the demo.
- **Home:** RM flagged · RM settled · RM still open, for this month (story 33).
- **"Checks left: N"** chip: one check per non-cached document read. This illustrates the deck's pay-per-check / credit-wallet model; there is no billing code.
- **Export CSV** of approved results: stub for "accounting partners" (deck slide 7).

### Self-billed e-invoice (deck slides 5 and 8): honest stub

For confirmed foreign suppliers, the app offers a "Prepare self-billed e-invoice" draft.
- **Fields shown:** e-invoice type 11 (self-billed), supplier name, country and generic foreign TIN `EI00000000030`, buyer details, currency + exchange rate, lines, tax, totals.
- **Flow:** owner approves, then **Release** logs an event. Status is `draft → approved → released_stub`.
- **Labelled on screen** *"Preview, not submitted to LHDN"*. There is never a "submitted" state (the type system forbids it).

## 3. Database & Auth

| Tool | Why judges care |
|---|---|
| **Supabase Postgres + private Storage** | Zero-config relational DB for a money ledger, plus private photo storage (50 MB/file). |
| **Drizzle ORM** (`drizzle-orm` 0.45 + `postgres` 3.4) via the **transaction pooler, port 6543, `prepare: false`** | Typed schema and migrations; pooler mode survives serverless cold starts. |
| **Ledger = pure function over rows** (same code as the tests) | Amount owed is always derived and can't drift. |
| **`events` table** (who, role, action, target, at) | Deck slide 8: "every action is saved in an activity log". |
| **Two seeded PINs: Owner and Staff** → signed cookie (`jose` 6), checked in **`proxy.ts`** | Deck slide 8 made real: staff record deliveries, only the owner approves. No sign-up or password reset (spec). |
| **Unguessable 128-bit evidence token per flag**; page rendered dynamically, photos via **signed URLs minted per request (1h)**, never stored; `noindex` | The supplier opens a read-only page with no login. It shows only that flag's PO, invoice, photos, highlighted line, and the price baseline with its source. No other flags, no amounts owed (whitelist builder, tested). |

## 4. The Wow Factor: tap-to-proof, live on two phones

**Gemini's `box_2d` spatial output, carried all the way to the supplier.** Gemini returns `[ymin, xmin, ymax, xmax]` (0–1000) for every line it reads.
- When the owner taps a flag, that exact line lights up on the invoice photo.
- The supplier's evidence page opens with the same line highlighted beside the signed bon.

Boxes are **display-only**. A bad box can never change a flag; if the box is missing or came from the fallback model, the UI highlights the row in the extracted table instead.

**Demo script (story 35, about 90 seconds):**
1. The PO is pre-seeded; seed data shows the full month on the home screen.
2. A judge photographs the prepared invoice on the **owner phone**.
3. Lines stream in. Staff types **8** received against **10** billed.
4. A **RM90.00** shortage appears with the line highlighted. The owner approves and picks "Deduct".
5. The owner taps WhatsApp, and the message lands on the **judge's phone**, which opens the evidence page with the highlighted line and signed bon.
6. The owner marks it **Settled: Credit note**, and on the projector **"Pay now" drops by RM90.00** and **RM settled** ticks up.

Run the demo phone-only (on a laptop, `wa.me` lands on WhatsApp Web).

---

## Hosting

**Vercel Hobby** for the app (zero-config Next.js, 300 s function limit, so 10–30 s Gemini calls are fine). **Supabase Free** for data and files. Replit is fine as an editor; we don't host there. Deploy a skeleton in hour 1.

## Testing

- **Vitest 5** on rules and ledger, covering every spec test case and the edge cases above, plus **fast-check** invariants (owed unchanged on Open → Disputed, never negative, integers only, short + price = billed − fair value).
- Gemini is replaced at the top seam by `MockLanguageModelV4` returning saved results (spec), covering primary, fallback-on-429 and manual-entry paths.
- **One Playwright smoke test** of the demo journey (stretch).
- **Before the demo:** 5+ real photographed handwritten bons through the reader, on the billed key (spec).

## Non-negotiables (each one bit us in testing)

1. `generateText` + `Output.object`, never `generateObject`. Images go as `{ type: 'file', mediaType: 'image/jpeg', data }`.
2. Call Gemini with **`maxRetries: 0`**, then branch on `APICallError.statusCode` (429 / 5xx → Flash-Lite; anything else, including schema rejection → manual entry). Otherwise the SDK retries twice and wraps the error in `RetryError`.
3. Gemini 3.8 Flash **cannot turn thinking off**: `'minimal'` is rejected; use `'low'`.
4. Parse AI prices as strings into **integer sen**; qty must be an integer. No floats anywhere; the ledger throws on one.
5. `box_2d` is `[y, x, y, x]`; easy to flip.
6. **Next 16:** the auth gate lives in **`proxy.ts`** (`export function proxy`), which runs on Node only.
7. **Next 16 `cacheComponents` is on by default.** Wrap `cookies()` and DB reads in `<Suspense>`, and call `await connection()` before any Drizzle query, or `next build` fails once `DATABASE_URL` is set.
8. Keep TypeScript at the template's `^5`; install `@types/json-schema` if `tsc` complains about `@ai-sdk/provider`.
9. Free Gemini key → **synthetic documents only** (free-tier content may be used to improve Google products). Real bons go on the billed key only.
10. Supabase Free pauses after 7 days idle; open the dashboard the day before the demo.
11. Never store signed URLs; mint them per request.

## Pinned versions (verified on npm 2026-10-22)

`next 16.4.2` · `react 19.3` · `tailwindcss 4.3.3` · `motion 14.6.0` · `ai 7.0.149` · `@ai-sdk/google 4.0.103` · `zod 4.6.7` · `drizzle-orm 0.45.4` · `drizzle-kit 0.31.11` · `postgres 3.4.9` · `jose 6.2.13` · `vitest 5.0.5` · `fast-check 4.10.2` · `pdfjs-dist` (latest) · Node 22.

## Build plan (36h, 3 parallel tracks)

| Track | Owner | Blocks (hours) |
|---|---|---|
| **A: AI & documents** | Dev 1 | Upload pipeline + PDF raster + Storage (3) · Gemini extraction, schema, fallback, cache, fixtures (5) · PO/invoice correct UI + PO suggestion (3) · 5+ real bons, prompt tuning (3) · Box overlay (3) |
| **B: Rules & money** | Dev 2 | DB schema + Drizzle + PIN roles + `proxy.ts` (3) · Rules engine + Vitest (4) · Lifecycle, ledger, credits, statement balance (4) · Home summary + reminder + checks chip (2) · Seed data (2) |
| **C: Flow & pitch** | Dev 3 | Count entry, flag screen, approve, drafter BM/EN, `wa.me` (4) · Evidence page (2) · Order "Correct" + events log + CSV stub (2) · E-invoice stub (2) · Motion polish (2) · Demo rehearsal × 3 (3) |

Solo or two people: drop Track C's last four items first.

**Cut line, in order:** e-invoice stub → EN toggle (keep BM message) → motion → box overlay (row highlight remains) → staff role.
**Never cut:** extraction + correct, rules, ledger, `wa.me`, evidence page, the two-phone demo.

## Decisions made for you (deck vs spec)

| Conflict | Decision |
|---|---|
| Name | **Tepat Bill** (it's on the deck judges see). |
| Single user (spec) vs staff roles (deck) | **Owner + Staff PINs**; about 1h of work, and it makes slide 8 true. |
| Wrong item out of demo (spec) vs promised (deck) | **Built** as "Not ordered", with a substitution guard. |
| Agreed prices (deck) vs last invoice (spec) | **Baseline chain:** agreed → PO price → last invoice → none. |
| No previous invoice (spec open item 3) | No flag; the first invoice becomes the baseline. |
| E-invoice (deck) vs accounting stub only (spec) | **Preview-only stub**, never submitted. |
| Pay per use (deck) vs model undecided (spec) | **"Checks left" chip**, illustrative; no billing. |
| "Reuses Orbyte's roles, audit trail, wallet" | Pitch as **"designed to plug into Orbyte"**: same role/approval/activity-log/credit-wallet shapes. |
| Reads "delivery photos" (deck) | Reads the **bon and invoice**; delivery photos are evidence. Say it on screen. |
| Replit (spec mention) vs hosting | **Vercel**; Replit only as an editor. |

## Known unknowns (and what covers them)

- **Gemini box accuracy on slanted, handwritten bons:** untested; covered by the row-highlight fallback and owner correction.
- **Exact free-tier numbers on your project:** check aistudio.google.com/rate-limit; covered by cache, fixtures and the billed key.
- **Flash-Lite `box_2d` quality:** untested; the fallback path uses row highlight.
