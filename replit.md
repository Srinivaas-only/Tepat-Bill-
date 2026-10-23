# Tepat Bill: standing rules for Replit Agent

> Read this file, `docs/PRD.md`, `docs/IMPLEMENTATION_NOTES.md` (exact wiring, data rules and UI specs; it overrides the PRD where they differ) and `docs/PROGRESS.md` before every task. The PRD is the source of truth; this file is the law.
> Keep this file's rules intact. You may append to the **Agent notes** section at the bottom; do not rewrite the sections above it.

## What we're building
**Tepat Bill** ("Check every delivery. Check every bill."): a mobile-first web app for Malaysian *kedai runcit* owners. Staff photograph supplier invoices and type the counts they received. Gemini reads the documents. Fixed code rules flag shortages, price changes and items not ordered, in RM. The owner approves and sends a prepared WhatsApp message to the supplier, with a read-only evidence link. The app tracks every complaint until it is settled and what is still owed. Hackathon: SDC 2026, Domain 2, Orbyte Smart SME Challenge.

**Principle: AI reads → rules decide → the owner approves.** The app never sends, pays or settles anything by itself, and never decides who is right.

## Stack (do not swap)
- **Client:** React 19 + Vite + TypeScript, Tailwind CSS 4, shadcn/ui, `motion` (`motion/react`), `@number-flow/react`, `sonner`, `lucide-react`, `wouter`, `@tanstack/react-query`, `react-zoom-pan-pinch`, `pdfjs-dist`.
- **Server:** Express 5 + TypeScript, `multer` (memory, 15 MB limit), `jose` (session cookie), Drizzle ORM + Replit PostgreSQL (`DATABASE_URL`), Replit App Storage via `@replit/object-storage`.
- **AI:** Vercel AI SDK 7 (`ai`, `@ai-sdk/google`) with **Gemini only**: `gemini-3.8-flash`, falling back to `gemini-3.5-flash-lite`. Use our own key from the `GEMINI_API_KEY` secret. **Do not use Replit AI Integrations, OpenAI or Anthropic.**
- **Tests:** Vitest (`npm test`), already configured in `vitest.config.ts`.

## Folder layout
```
client/src/  pages/ components/ features/ lib/ i18n/      React app
server/      index.ts app.ts routes/ db.ts storage.ts auth.ts seed.ts   (the Gemini reader lives in shared/core/extract.ts, server-only)
shared/schema.ts                                         Drizzle tables + zod insert schemas
shared/core/                                             GOLDEN LOGIC: tested, READ-ONLY (see below)
fixtures/    docs/*.png + *.expected.json, seed.json     synthetic demo data
docs/        PRD.md BUILD_PROMPT.md PROGRESS.md DECISIONS_LOG.md
```

## `shared/core/` is read-only golden logic
`rules.ts` (flags), `ledger.ts` (status, amount owed, reminders, home summary), `roles.ts`, `messages.ts` (supplier message + `wa.me` link), `evidence.ts` (evidence page whitelist), `einvoice.ts` (stub), `extract.ts` (Gemini reader, **server-only**), with 130 passing core tests (hardening regressions in `hardening.test.ts`).
- **Import and call these functions. Never re-implement flag, money, role, message or evidence logic anywhere else.**
- Never edit `shared/core/*` or `fixtures/*` to make something pass. If you truly believe core is wrong, write it in `docs/DECISIONS_LOG.md` and work around it at the call site.
- Client code imports from `shared/core/index.ts` only (browser-safe). Only the server imports `shared/core/extract.ts`.

## Non-negotiables
1. **Money is integer sen** everywhere: DB columns, API, state. Format only at render with `formatRM`. Parse AI prices with `parseRM` / `linesToSen`. No floats, ever.
2. **The AI never computes**: no flags, totals or amounts from Gemini. It only fills the extraction schema.
3. **Owner-only actions are enforced on the server** with `can(role, action)` from `shared/core/roles.ts`, not just hidden in the UI.
4. **Nothing is auto-sent.** WhatsApp opens via a `wa.me` link the owner taps. No email, SMS or payment code.
5. **Gemini calls:** `maxRetries: 0`; fall back to Flash-Lite on 429/5xx; otherwise go to manual entry. Cache every read by SHA-256 (the `extractions` table). Call it only from the server.
6. **Evidence page** (`/e/:token`) is public and read-only. It shows only `buildEvidence()` output, adds `noindex`, and serves photos through a token-checked route.
7. **Bahasa Malaysia is the default UI language**, with an English toggle. All strings come from `client/src/i18n/{ms,en}.ts`. No hard-coded UI text.
8. **Premium UI bar:** follow PRD section 6 (design system) exactly. No default-looking shadcn screens, no layout shift, no bare spinners, `tabular-nums` on every number.
9. **Free Gemini key:** use synthetic documents only (`fixtures/docs`). Never commit secrets.
10. **Don't ask the user questions.** If something is unclear, pick the PRD default (or the simplest option consistent with it), log it in `docs/DECISIONS_LOG.md`, and keep going.

## Commands
- `npm run dev`: client and server on one port (bind to `0.0.0.0`, port from `PORT`).
- `npm test`: Vitest. **Must stay green after every milestone.**
- `npm run typecheck`: add this script in M0 (`tsc --noEmit` over client, server and shared).
- `npm run db:push`: apply the Drizzle schema. `npm run seed`: reset and load `fixtures/seed.json`.

## Secrets
`GEMINI_API_KEY` (required), `SESSION_SECRET` (random 32+ characters), `OWNER_PIN`, `STAFF_PIN` (default to the seed PINs 1234 / 5678 in development), `DEMO_FIXTURES=1` (shows the demo-read fallback), `PUBLIC_BASE_URL` (for evidence links; defaults to the request origin).

## Definition of done (per milestone)
`npm test` is green · the typecheck passes · the milestone's acceptance checks in `docs/BUILD_PROMPT.md` pass in App Testing on a 390px-wide viewport · `docs/PROGRESS.md` is ticked with a one-line note · go straight on to the next milestone.

## Never
Swap the stack · rewrite `shared/core` · store money as floats · let staff approve, send or settle · auto-send messages · expose other flags or totals on the evidence page · add sign-up, password reset or multi-shop · count stock from photos · claim "% time saved" anywhere · submit anything to LHDN · call Gemini from the browser.

## Agent notes
<!-- Agent: append short learnings here (gotchas, commands). Do not edit the sections above. -->
- Build finished M0–M10 (see `docs/PROGRESS.md`, `docs/DECISIONS_LOG.md`). API tests run in a separate `test` Postgres schema (never touch dev data); `npm test` needs `DATABASE_URL`.
- Browser testing needs `OWNER_PIN=1234 STAFF_PIN=5678` on the workflow because the real PINs are secrets. Settings → "Set semula demo" (dev only) reseeds the DB (`POST /api/dev/reset`).
- Deployment: Reserved VM (`npm run build` then `npm run start`). Set `PUBLIC_BASE_URL` to the published URL so evidence links in WhatsApp messages are correct; run the seed once on the production DB.
- Not measured: Lighthouse scores; wa.me opening on a real phone.
- Never set NODE_ENV as a secret or env var: the deployment sets it, and a wrong value breaks the production static serving.
