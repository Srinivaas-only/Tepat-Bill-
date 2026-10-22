# Tepat Bill: Tech Stack

> SDC Hackathon 2026 · Domain 2 · Orbyte Smart SME Challenge
> Derived from `SPEC_TepatBuild.md` and the 11-slide deck. Cross-checked by three independent agents (live fact-check, red-team, build test) on 2026-10-22.

## Architecture in one sentence

A mobile-first Next.js app where Gemini vision reads handwritten bons and invoices **and says where on the photo it read each line**, a pure-TypeScript integer-sen rules engine (not the AI) decides every flag, the owner approves, and WhatsApp opens with the drafted message and a read-only evidence link. This is the spec's rule, "AI reads, rules decide, owner approves", built as the architecture.

---

## 1. Frontend & UI

| Tool | Why it impresses the judges |
|---|---|
| **Next.js 16 (App Router) + React 19** | One codebase serves the owner's phone UI and the supplier's no-login evidence page (server-rendered, nothing extra to ship). |
| **Tailwind CSS v4 + shadcn/ui** | Premium, consistent UI in hours, and the deck's blue/navy look is a few tokens. |
| **`motion` (`motion/react`) used sparingly** | One RM count-up on the home screen ("RM flagged / settled / open") and a flag-card entrance; it makes the money feel real without costing a day. |
| **Native camera (`<input type=file accept="image/*" capture>`) + client-side JPEG downscale (~1600px long edge)** | Zero-permission camera flow that works on any kedai owner's phone, and it avoids HEIC and oversized-upload failures. |
| **SVG bounding-box overlay on the invoice photo** | The visible half of the wow factor (see section 4). |
| **Malay-first UI with BM/EN toggle** (plain JSON dictionary, no i18n framework) | The users are Malaysian kedai owners; the drafted supplier message in Bahasa Malaysia is a local differentiator generic apps lack. |

Rejected: a PWA service worker (a manifest is enough), heavy animation libraries, streaming UI (stretch only).

## 2. Backend & AI Engine

| Tool | Why it impresses the judges |
|---|---|
| **Vercel AI SDK 7 (`ai`, `@ai-sdk/google`, `@ai-sdk/anthropic`)** with `generateText({ output: Output.object({ schema }) })` | Provider-swappable structured extraction behind one function, and tested offline with `MockLanguageModelV4`. |
| **Zod 4 schemas as the single source of truth** | The same schema validates the AI's output, the DB write and the UI form, so a hallucinated "2.5 cartons" is rejected before it reaches a rule. |
| **Gemini Flash vision (primary; confirm the exact model id in AI Studio, third-party sources say `gemini-3.8-flash`)** | Free key for build and demo, native `box_2d` spatial output, and strong handwriting reads. |
| **Claude vision fallback (`claude-haiku-5-5`, behind an env flag)** | Cheap (about $0.0005 per image at max resolution per Anthropic's published pricing) insurance if the Gemini free-tier quota dies mid-demo. |
| **Content-addressed extraction cache (SHA-256 of the uploaded file → saved JSON)** | The spec requires "no extra requests on re-runs", and it doubles as demo resilience and quota protection. |
| **Pure-function rules and ledger engine (TypeScript, integer sen, no floats)** | Short-quantity and price-change flags and amount owed are deterministic, auditable and unit-tested, so the AI never touches arithmetic. |
| **Template-based message drafter (BM/EN)**; numbers injected from the rules engine, the LLM only polishes wording | The supplier message cannot contain a number the rules engine didn't produce, and it carries no demands or legal wording, per the spec. |
| **Item matching: normalise + token overlap / `pg_trgm`, plus a per-supplier alias table learned from owner corrections** | Matches "MILO TIN 1KG" to "Milo 1kg" with about 10 SKUs of synthetic data, without an embeddings quota. |
| **WhatsApp `wa.me/60…?text=` deep link** | The owner taps send; no WhatsApp Business account and no auto-sending, exactly as the spec requires. |

## 3. Database & Auth

| Tool | Why it impresses the judges |
|---|---|
| **Supabase Postgres + private Storage (signed URLs)** | Zero-config relational DB, which fits the money ledger (amount owed = invoice totals − settled deductions), plus private photo storage. |
| **Drizzle ORM** | Typed schema and migrations in one file, with the same TypeScript types flowing from DB to UI. |
| **Ledger as a computed view/function; flag status Open / Settled / Disputed** | The "amount owed" figure is derived and can't drift from the underlying records. |
| **Plain `events` table (who, what, when)** | Delivers the deck's "every action is saved in an activity log" in about 30 minutes, with no overclaim. |
| **Seeded single-owner PIN session (signed cookie)** | Matches the spec's "no sign-up, no password reset", and avoids Supabase's tight built-in email limits that break magic links. |
| **Unguessable 128-bit evidence token per flag** | The supplier opens a read-only page with no login; it shows only that flag's PO, invoice and photos, uses `noindex`, and stays valid for 90+ days so a dispute never hits a dead link. |

Operational note: Supabase free projects pause after 7 days idle, so wake the project the day before the demo.

## 4. The Wow Factor

**Click-to-highlight bounding boxes: "AI reads, rules decide" made visible.**

Gemini returns a `box_2d` (`[ymin, xmin, ymax, xmax]`, normalised 0–1000) for every line item it reads. Tap a shortage flag and the exact line lights up on the owner's invoice photo, and the same highlight appears on the supplier's evidence page. Boxes are **display-only**: a bad box can never change a flag, and when a box is missing the UI falls back to row highlighting.

**Pair it with the demo ritual:** a judge photographs a prepared bon on their own phone, sees the RM flag appear, taps WhatsApp, and the evidence page opens on the "supplier" side, with the home screen's RM flagged / settled / open ticker updating. That is user story #35 (full journey in one demo) done live.

---

## Cross-check results (what changed from my first draft)

| Draft idea | Verdict | Why |
|---|---|---|
| `generateObject` / `streamObject` | **Replaced** | Deprecated in AI SDK 6/7; use `generateText` + `Output.object`. Verified in the installed type definitions. |
| Embeddings + pgvector | **Cut to stretch** | Overkill for about 10 synthetic SKUs; trigram + alias table does the job and avoids a quota and an extension. |
| Hash-chained audit log, EXIF "proof" | **Cut** | Theatre without external anchoring; browsers and WhatsApp strip EXIF; implies legal weight. SHA-256 stays, only as the cache key. |
| Streaming extraction / drafter | **Stretch** | Cosmetic; partial structured JSON is fragile. |
| Supabase magic-link auth | **Replaced with PIN** | Free-tier built-in email is reportedly about 2/hour. |
| fast-check, full Playwright | **Kept small** | Vitest on the spec cases is mandatory; property tests were cheap and pass; one Playwright smoke test is stretch. |
| Bounding-box wow | **Kept** | Maps to the spec's core principle; judges see it in seconds. |

### Empirically verified (scratch project, not committed)

- `ai@7.0.149`, `@ai-sdk/google@4.0.103`, `@ai-sdk/anthropic@4.0.86`, `zod@4.6.7`, `vitest@5.0.5`, `fast-check@4.10.2` install with no peer conflicts.
- **21/21 tests pass and `tsc` exits 0.** These cover all the spec's test cases (RM90 shortage from 2 of 10 cartons, no flag on an exact match, price +RM0.40 × 50 = RM20.00 impact, dismissal creates no dispute, settled lowers owed, disputed leaves it unchanged, settled on a Paid order creates a credit, evidence payload is flag-scoped), plus property tests and the extraction seam running offline against a mock model.
- A realistic six-item BM `wa.me` message is about 736 characters, well under 2000.

### Not verified (treat as unknown)

- **Gemini free-tier limits.** Sources conflict (anywhere from about 20 to 1,500 requests per day). Check the AI Studio quota page, and design for the low end with the cache plus pre-extracted demo fixtures and a "load sample" button.
- **Gemini bounding-box accuracy on handwritten, phone-photographed bons.** No evidence either way. The spec already demands testing 5+ real bons; do it early.
- **Exact current Gemini model id.** It came from third-party pages because `ai.google.dev` was unreachable from the test environment.
- **Replit hosting of this exact stack.** Not tested. Deploy a skeleton in hour 1. Use your own Gemini key, not Replit's AI proxy (reported flaky for structured output).
- **Free-tier privacy.** Unpaid Gemini API content may be used to improve Google products: **synthetic documents only**, and say so on a slide. Malaysia's amended PDPA treats overseas AI processing as a cross-border transfer; add a consent and retention note for real use.

## Gotchas a team will hit

1. Add `@types/json-schema` (or `skipLibCheck: true`) or `tsc` fails on `@ai-sdk/provider`.
2. Most tutorials and LLM-written snippets use removed APIs (`generateObject`, `{type:'image'}` parts, `MockLanguageModelV1/V2`). Use `{type:'file', mediaType}` parts and `MockLanguageModelV4`.
3. The `create-next-app` default turns on `cacheComponents` and Turbopack-only Tailwind loading; untested with Drizzle/`pg`. Disable `cacheComponents` unless you need it.
4. Parse prices from the AI as strings into integer sen; qty as integers only. Never let a float in.
5. Gemini `box_2d` order is `[y, x, y, x]`, easy to flip.
6. `wa.me` cannot attach files and can't target a supplier without a stored phone number (store one per supplier, format `60…` without `+`). Test on a real phone.

## Spec and deck conflicts to resolve before building

1. **Name:** deck says "Tepat Bill", spec says "TepatBuild" (spec open item 4).
2. **Roles:** spec says no staff or roles; deck slide 8 says staff record, only the owner approves. Cheapest honest fix: a 2-role toggle in the demo (about 1h), or label it "Orbyte integration point".
3. **"Reuses Orbyte's roles, approvals, audit trail, credit wallet"** is a claim, not a fact; we don't have Orbyte's schema. Reword to "designed to plug into".
4. **Self-billed e-invoice** (slides 5 and 8) is absent from the spec. Show it as roadmap or a stub, never as working. (A MyInvois sandbox exists per third-party sources; a micro SME under RM1m turnover is likely exempt.)
5. **Wrong-item / damaged flags** appear in the deck but are out of the spec's demo. Only short quantity and price change are live.
6. **"Agreed prices"** (slide 5) has no counterpart in the spec; the baseline is the supplier's last invoice price. Spec open item 3 (no previous invoice) is undecided; proposed default: no baseline, no price flag, and seed a prior invoice in demo data.
7. **Pay-per-check** is proposed, not decided; don't build wallet code.

## Spec ambiguities found while testing (decide and lock in)

- Does "Settled by redelivery" change amount owed? Tested default: **no**, only a deduction reduces owed.
- Is a credit on a Paid order shown inside "amount owed"? Tested default: **no**, kept as a separate credit; next payment = max(0, owed − credit).
- On a settled price flag, does the deduction equal the full impact or only the gap to the agreed price? **Unspecified.**

## Suggested build order (36h, 1–2 people)

| # | Block | Hours |
|---|---|---|
| 1 | Skeleton deployed (Replit or Vercel), DB, PIN auth, upload + compression, HEIC test | 3 |
| 2 | Vision extraction, Zod, cache, fixtures, manual-correct UI | 6 |
| 3 | Rules engine + Vitest on the spec cases | 3 |
| 4 | Counts, flag screen, approve, redeliver/deduct choice, drafter + `wa.me` | 4 |
| 5 | Evidence page | 2 |
| 6 | Lifecycle, payment tracker, owed ledger, home summary | 5 |
| 7 | Bounding-box overlay linked to flags (with fallback) | 3 |
| 8 | Test 5+ real handwritten bons, tune prompts | 3 |
| 9 | Seed data, BM/EN toggle, role toggle | 2 |
| 10 | Deck fixes, demo rehearsal | 3 |
| 11 | Buffer | 2 |

**Stretch:** pgvector item matching, streamed extraction, Claude fallback wiring, Playwright smoke test.
