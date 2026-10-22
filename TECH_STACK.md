# Tepat Bill: Tech Stack (final, Replit-native)

> SDC Hackathon 2026 · Domain 2 · Orbyte Smart SME Challenge. **Gemini is the only AI provider.** Built with Replit Agent, then polished with Claude Code via GitHub.
> Full product detail: `docs/PRD.md`. How to build it: `docs/BUILD_PROMPT.md`. Agent rules: `replit.md`.
> Verified 2026-10-22: live fact-check, red-team (all 35 stories, 11 slides), empirical build. `shared/core` has **82 passing tests**, and package versions were checked against npm.

## Architecture in one sentence

A mobile-first React + Express app built and hosted on Replit. Staff photograph the invoice and type the counts; **Gemini 3.8 Flash** reads every line and says where on the page it read it; a tested pure-TypeScript integer-sen rules engine (never the AI) computes every RM flag; the owner approves; and one tap opens WhatsApp with a factual message linking to an evidence page where the supplier sees the exact line highlighted.

---

## 1. Frontend & UI (premium fintech feel; PRD section 6 is the bar)

| Tool | Why judges care |
|---|---|
| **React 19 + Vite 8 + TypeScript**, `wouter`, `@tanstack/react-query` | Replit Agent's native stack: fastest to build, fewest Agent loops; optimistic updates make it feel instant. |
| **Tailwind CSS 4 + shadcn/ui**, restyled with deck tokens (navy `#13254A`, blue `#2457D6`), **DM Sans**, `tabular-nums` | Looks like the deck judges just saw; money reads like a bank app. |
| **`motion`** (springs, list stagger, shared-layout card → detail) + **`@number-flow/react`** (rolling RM digits) | The money moving on screen *is* the story: "Pay now" rolls down live when a flag is settled. |
| **The reading moment:** scan-beam over the photo, then Gemini's boxes draw in line by line as rows slide into the list | The AI made visible; the most memorable 3 seconds of the demo. |
| **Bottom sheets, `sonner` toasts, sticky blurred action bar, skeletons, `lucide-react`** | Thumb-first mobile patterns from top consumer apps; no bare spinners. |
| **Two upload paths:** Snap (`capture="environment"`) or File (image/PDF); canvas downscale to 1600px JPEG; `pdfjs-dist` rasterises PDF page 1 | Any invoice format (story 4); boxes work on PDFs too; small uploads. |
| **`react-zoom-pan-pinch` + SVG `box_2d` overlay** | Pinch-zoom proof on both the owner's screen and the supplier's evidence page. |
| **BM-first i18n with EN toggle** (plain dictionaries) | Built for kedai runcit owners; the supplier message drafts in BM or EN. |

## 2. Backend & AI Engine (Gemini only)

| Tool | Why judges care |
|---|---|
| **Express 5 + TypeScript**, `multer` (15 MB) | Agent-native, simple, one port with Vite. |
| **Vercel AI SDK 7** (`ai` + `@ai-sdk/google`), `generateText` + `Output.object` | Typed, validated extraction; tested offline with `MockLanguageModelV4`. |
| **`gemini-3.8-flash`** (thinking `low`, media resolution high) → **`gemini-3.5-flash-lite`** on 429/5xx → manual entry | Gemini-only resilience; `maxRetries: 0` so fallback is instant. |
| **Own `GEMINI_API_KEY`** (Replit Secret); billing attached for demo day | Not Replit's AI proxy (reported unreliable for structured output); about RM0.03 per read, and billed-tier data isn't used for training. |
| **Flat Zod `ExtractedDoc` + `EXTRACTION_PROMPT`** (`shared/core/extract.ts`) | BM/EN/Chinese, handwritten or printed; prices as strings → integer sen; boxes per line. |
| **SHA-256 read cache + pre-read fixtures + manual entry** | Demo can't die: live → cache → fixture → manual. |
| **`shared/core`: pure rules, ledger, roles, messages, evidence, e-invoice stub** | The AI never does arithmetic; every RM figure is reproducible and tested (82 tests, property-based). |
| **`wa.me` deep link** | Owner taps send; nothing is auto-sent. |

## 3. Database & Auth (Replit-native)

| Tool | Why judges care |
|---|---|
| **Replit PostgreSQL** (`DATABASE_URL`, separate dev/prod DBs) + **Drizzle ORM** | Zero setup inside Replit; typed schema; money as integer columns. |
| **Replit App Storage** (`@replit/object-storage`), files keyed by SHA-256, streamed through authed/token routes | Private photos without public buckets; dedup for free. |
| **Two PINs (Owner / Staff)** → `jose` HS256 cookie; server checks `can(role, action)` | Deck slide 8 made real: staff record, only the owner approves. No sign-up (spec). |
| **`events` table** | Every action logged (deck: activity log). |
| **Unguessable 128-bit evidence token per flag** | Supplier sees one flag's proof with no login; `noindex`; whitelist-tested. |

## 4. The Wow Factor: tap-to-proof, live on two phones

Gemini's `box_2d` follows the money all the way to the supplier:
- When the owner taps a flag, the invoice zooms to that exact line.
- The supplier's evidence page opens with the same line pulsing, beside the signed bon.
- Settling it rolls "Pay now" down on the projector.

Boxes are display-only. A bad box never changes a flag, and the row highlight is the fallback.

## Hosting
Replit workspace for development. **Reserved VM** deployment on demo day (no cold start). GitHub sync via the Git pane, so Claude Code can polish.

## Pinned versions (npm, 2026-10-22)
`react 19.3` · `vite 8.3` · `tailwindcss 4.3.3` · `motion 14.6.0` · `@number-flow/react 0.6.2` · `sonner 2.0.8` · `wouter 3.13` · `@tanstack/react-query 5.104` · `react-zoom-pan-pinch 4.2` · `pdfjs-dist 6.4` · `lucide-react 1.61` · `express 5.3` · `multer 2.5` · `jose 6.2.13` · `drizzle-orm 0.45.4` · `drizzle-kit 0.31.11` · `@replit/object-storage 1.0` · `ai 7.0.149` · `@ai-sdk/google 4.0.103` · `zod 4.6.7` · `vitest 5.0.5` · `fast-check 4.10.2` · Node 22.

Avoided: `vaul` (unmaintained since 2024; shadcn bottom `Sheet` instead) and `browser-image-compression` (stale since 2023; 20 lines of canvas instead).

## Non-negotiables
1. `generateText` + `Output.object`, never `generateObject`. Call Gemini with `maxRetries: 0`, then branch on `APICallError.statusCode`.
2. Gemini 3.8 Flash can't turn thinking off: `'minimal'` is rejected; use `'low'`.
3. Integer sen everywhere; `parseRM` for AI strings; no floats.
4. `box_2d` is `[ymin, xmin, ymax, xmax]` on a 0–1000 scale; use it as `/10` percent coordinates.
5. Free Gemini key → synthetic documents only.
6. `shared/core` is read-only for the Agent; tests must stay green.

## Decisions (deck vs spec), all final
See PRD section 15.
- **Name and roles:** Tepat Bill · Owner + Staff.
- **Flag rules:** wrong item is built (with a substitution guard); price baseline is agreed → PO → last invoice.
- **Money:** redelivered leaves owed unchanged; credit on a paid invoice goes to the next invoice; disputed stays owed; reminder 14 days after sending.
- **Deck extras:** e-invoice preview stub · "Checks left" chip · "designed to plug into Orbyte".
