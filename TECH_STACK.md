# Tepat Bill: Tech Stack (decided)

> SDC Hackathon 2026 · Domain 2 · Orbyte Smart SME Challenge
> Source of truth: `SPEC_TepatBuild.md` (what we build) and the 11-slide deck (what judges are told). Every decision below is final; reasons are one line each.

## Architecture in one sentence

A mobile-first Next.js app on Vercel where **Gemini** reads orders, invoices and bons (photo, screenshot or PDF) and points at where it read each line, a pure-TypeScript integer-sen rules engine decides every flag, staff record and the owner approves, and WhatsApp opens with a drafted message and a read-only evidence link for the supplier.

---

## 1. Frontend & UI

| Tool | Why judges care |
|---|---|
| **Next.js 16 (App Router) + React 19** | One app serves the owner's phone UI and the supplier's no-login evidence page. |
| **Tailwind CSS v4 + shadcn/ui** in the deck's blue/navy palette | The product looks like the deck the judges just saw. |
| **`motion`** (`motion/react`): RM count-up on home, flag-card entrance, status-chip transitions | Money moving on screen is the story; three animations, no more. |
| **Native camera** `<input type=file accept="image/*,application/pdf" capture>` + client JPEG downscale (~1600px) | One upload button for photo, screenshot or PDF (spec story 4), with no HEIC or oversized uploads. |
| **SVG bounding-box overlay** on the document image | The wow factor (section 4). |
| **Bahasa Malaysia first, English toggle** (plain JSON dictionary) | Built for kedai runcit owners; the supplier message drafts in BM. |

## 2. Backend & AI Engine (Gemini only)

| Tool | Why judges care |
|---|---|
| **Vercel AI SDK 7** (`ai` + `@ai-sdk/google`) with `generateText({ output: Output.object({ schema }) })` | Typed, validated extraction in one call; model-swappable inside Gemini; testable offline. |
| **Zod 4 schemas** shared by AI output, DB writes and forms | A misread like "2.5 cartons" is rejected before any rule sees it. |
| **Gemini Flash** (primary) → **Gemini Flash-Lite** (fallback on 429/5xx) | Gemini-only resilience: two models, two separate quota buckets. |
| **Native PDF + image input to Gemini** | Suppliers send invoices as photos, screenshots or PDFs; Gemini reads all three directly. |
| **SHA-256 extraction cache** + **pre-extracted demo fixtures** + **manual-entry form** | Re-runs cost zero requests (spec); the demo survives a dead quota; the owner can always correct. |
| **Pure-function rules + ledger engine** (TypeScript, integer sen) | The AI never does arithmetic; every RM figure is reproducible and unit-tested. |
| **Template drafter (BM/EN)**: numbers come only from the rules engine | The supplier message is factual, with no demands or legal wording (spec). |
| **Item matching:** normalise + token overlap, plus a per-supplier alias table learned from owner corrections | "MILO TIN 1KG" ↔ "Milo 1kg" without an extra AI call. |
| **`wa.me/60…?text=`** deep link | The owner taps send; nothing is auto-sent (spec + deck slide 8). |

### Flag rules (deterministic, owner confirms every one)

1. **Short quantity:** received < invoice qty (or < PO qty) → missing qty × invoice unit price.
2. **Price change:** invoice unit price ≠ the supplier's **price list** for that item. The price list auto-fills from the last invoice and the owner can set an agreed price (this unifies deck slide 5 "agreed prices" with the spec's "last invoice price"). A supplier's first invoice sets the baseline and raises no flag.
3. **Wrong item:** an invoice line with no match on the PO → "Not ordered" flag for the owner to confirm or dismiss (deck slides 2 and 4). Damaged and expired goods stay roadmap (spec).

### Settlement and money (deck slide 5 + spec)

- Each flag has a status: **Open / Settled / Disputed**. Settled carries **Redelivered / Credit note / Deducted**.
- Each order is **On credit** (due date ~90 days, editable) or **Paid**.
- **Amount owed per supplier** = invoice totals − settled credit notes and deductions. Disputed amounts stay owed; the app never assumes the owner is right.
- A credit note or deduction on a **Paid** order becomes a **credit against the next invoice**.
- Redelivered: owed is unchanged (the goods arrive, so the invoice stands).
- After about 14 days unsettled, the flag shows a soft "follow up" reminder.

### Self-billed e-invoice (deck slides 5 and 8): stub

Suppliers marked **foreign** get a "Prepare self-billed e-invoice" draft (MyInvois field layout, preview only). The owner approves; "Release" logs the event and does **not** submit to LHDN (spec: accounting links are stubs). Labelled *Preview, not submitted* on screen.

## 3. Database & Auth

| Tool | Why judges care |
|---|---|
| **Supabase Postgres + private Storage** (signed URLs) | Zero-config relational DB for a money ledger, plus private photo storage. |
| **Drizzle ORM** | Typed schema and migrations; types flow from DB to UI. |
| **Ledger as SQL view / pure function** | Amount owed is always derived and can't drift. |
| **`events` table** (who, what, when) | Deck slide 8: "every action is saved in an activity log". |
| **Two seeded PINs: Owner and Staff** (signed cookie via `jose`) | Deck slide 8 made real: staff record deliveries, only the owner can approve, dismiss, mark correct or release. No sign-up or password reset (spec). |
| **Unguessable 128-bit evidence token per flag** | The supplier opens a read-only page with no login; it shows only that flag's PO, invoice and photos, uses `noindex`, and stays valid for 120 days. |
| **"Checks" counter chip** (one check per document read) | Shows the deck's pay-per-check / credit-wallet model; illustrative, no billing code. |

## 4. The Wow Factor

**Tap a flag → the exact line lights up on the invoice.**
Gemini returns `box_2d` (`[ymin, xmin, ymax, xmax]`, 0–1000) for every line it reads. Tapping a flag highlights that line on the owner's invoice photo **and** on the supplier's evidence page. This is "AI reads, rules decide" made visible. Boxes are display-only: a bad box can never change a flag, and a missing box falls back to row highlighting.

**Demo ritual (user story 35):** a judge photographs a prepared bon on their own phone → the RM flag appears with the line highlighted → tap WhatsApp → the evidence page opens on the "supplier" phone → mark Settled (Credit note) → the home screen's RM recovered ticks up.

---

## Hosting

**Vercel (Hobby)** for the app, **Supabase** for data. Next.js on Vercel is zero-config. Replit is fine as the editor; we don't host there.

## Testing

- **Vitest** on the rules and ledger with every spec test case, plus a few **fast-check** invariants (owed never changes on Open → Disputed; integers only).
- Gemini is replaced by saved results at the top seam (`MockLanguageModelV4`), so tests are repeatable (spec).
- **Before the demo:** run 5+ real photographed handwritten bons through the reader (spec).

## Non-negotiables (gotchas)

1. Use `generateText` + `Output.object`, never `generateObject` (deprecated). Pass images and PDFs as `{ type: 'file', mediaType }`.
2. Parse AI prices as strings into integer sen; qty as integers. No floats anywhere.
3. `box_2d` is `[y, x, y, x]`; easy to flip.
4. Install `@types/json-schema` or `tsc` fails on `@ai-sdk/provider`.
5. Use **synthetic documents only** on the free Gemini key (free-tier content may be used to improve Google products).
6. Supabase free projects pause after 7 days idle; wake the project the day before.
7. Store a WhatsApp number per supplier (`60…`, no `+`).

## Build order (36h)

| # | Block | h |
|---|---|---|
| 1 | Deploy skeleton to Vercel, Supabase + Drizzle, PIN roles, upload + downscale | 3 |
| 2 | Gemini extraction (image + PDF), Zod, fallback model, cache, fixtures, manual correct | 6 |
| 3 | Rules (short / price / not-ordered) + ledger + Vitest | 4 |
| 4 | Counts, flag screen, owner approve, redeliver/deduct choice, drafter, `wa.me` | 4 |
| 5 | Evidence page | 2 |
| 6 | Lifecycle, payment tracker, credits, home summary, reminder | 4 |
| 7 | Bounding-box overlay linked to flags | 3 |
| 8 | 5+ real handwritten bons, prompt tuning | 3 |
| 9 | BM/EN, seed data, e-invoice stub, checks chip | 3 |
| 10 | Demo rehearsal + buffer | 4 |
