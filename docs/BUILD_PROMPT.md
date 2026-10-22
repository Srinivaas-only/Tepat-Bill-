# Building Tepat Bill with Replit Agent

This file has 5 parts:
- **A. Runbook:** what *you* do, step by step.
- **B. Master prompt:** paste once.
- **C. Continue prompt.**
- **D. Recovery prompts.**
- **E. Hand-off to Claude Code** for polish.

The repo already contains everything the Agent needs:
- `replit.md`: rules the Agent re-reads every run.
- `docs/PRD.md`: what to build.
- `shared/core/`: tested business logic (82 tests).
- `fixtures/`: demo documents, expected reads and seed data.
- `docs/PROGRESS.md`: checklist.

The Agent should rarely need you.

---

## A. Runbook (about 15 minutes of your time, then mostly waiting)

1. **Import the repo.** In Replit, open *Create App → Import from GitHub*, choose `Srinivaas-only/Tepat-Bill-` (branch `main`), and let it install.
2. **Add secrets** (Tools → Secrets):

   | Secret | Value |
   |---|---|
   | `GEMINI_API_KEY` | Your AI Studio key. Attach billing before testing real bons or demo day; about RM5 total. |
   | `SESSION_SECRET` | Any 40 random characters. |
   | `OWNER_PIN` | `1234` |
   | `STAFF_PIN` | `5678` |
   | `DEMO_FIXTURES` | `1` |

3. **Agent settings:** **Power** (or Max) mode, and **App Testing ON** (Advanced). This lets the Agent click through the app in a real browser to check its own work.
4. **Plan mode first.** Switch the Agent to **Plan**, paste **Part B**, and let it produce the plan. Check that it lists milestones M0–M10 and says it will keep `shared/core` read-only. Then press **Approve / Start building** (Build mode).
5. **Let it run.** If it stops between milestones, paste **Part C** (one line). If something goes wrong, use the matching prompt in **Part D**. Don't chat with it otherwise; every answer it needs is in the PRD.
6. **After M10:**
   - Open the Git pane → **Pull**, then **Push** to GitHub `main`.
   - Publish as a **Reserved VM**.
   - Set the same secrets in the deployment, plus `PUBLIC_BASE_URL=https://<your-app>.replit.app`.
   - Run `npm run db:push && npm run seed` once against production.
7. **Rehearse** the demo script (PRD section 12) on two phones three times.

---

## B. Master prompt (paste this whole block into Replit Agent, Plan mode first)

```text
You are the lead engineer building "Tepat Bill", a hackathon-winning, premium-quality, mobile-first web app. This repository already contains the full specification and tested business logic. Your job is to build the complete app from it, autonomously, in milestones, without asking me questions.

READ FIRST, IN THIS ORDER, AND RE-READ WHEN UNSURE:
1. replit.md: standing rules (stack, non-negotiables, never-list). These override anything else.
2. docs/PRD.md: the product: roles, stories with acceptance criteria, every screen, the design system (section 6), data model (7), API (8), AI contract (9), demo (12), decisions (15).
3. shared/core/*.ts and its tests: the ONLY implementation of flags, money, roles, messages, evidence, e-invoice and the Gemini reader. Import it; never rewrite it; never edit it.
4. fixtures/: demo documents, expected AI reads with true bounding boxes, and seed.json.
5. docs/PROGRESS.md: tick milestones here as you finish them.

GOAL
Ship the whole PRD as a working, deployed Replit app that:
(a) runs the 90-second demo script in PRD section 12 flawlessly on a phone;
(b) looks and feels like a top-tier fintech app (PRD section 6 is the bar: tokens, DM Sans, tabular numbers, springy motion, NumberFlow money, bottom sheets, skeletons, BM-first copy);
(c) keeps `npm test` green.

STACK (do not swap): React 19 + Vite + TypeScript + Tailwind 4 + shadcn/ui + motion + @number-flow/react + sonner + lucide-react + wouter + @tanstack/react-query + react-zoom-pan-pinch + pdfjs-dist on the client; Express 5 + multer + jose + Drizzle ORM + Replit PostgreSQL + Replit App Storage (@replit/object-storage) on the server; Vercel AI SDK 7 (ai + @ai-sdk/google) with Gemini ONLY via process.env.GEMINI_API_KEY (no Replit AI Integrations, no OpenAI, no Anthropic). Merge into the existing package.json, vitest.config.ts and .gitignore; keep their scripts and dependencies.

AUTONOMY RULES
- Do not ask me anything. When something is unclear, choose the PRD default or the simplest option consistent with it, append one line to docs/DECISIONS_LOG.md, and continue.
- Work milestone by milestone (below). After each one: run `npm test` and the typecheck, use App Testing at a 390px-wide mobile viewport to click through that milestone's acceptance checks, fix anything failing, tick docs/PROGRESS.md with a one-line note, then CONTINUE to the next milestone without waiting for me.
- Never edit shared/core/* or fixtures/* to make something pass. Never store money as floats. Never compute money outside shared/core. Enforce owner-only actions on the server with can(role, action).
- Every screen must pass the polish checklist in PRD section 6.8 before its milestone is done.

MILESTONES
M0 Foundation: full-stack TS scaffold (Vite client + Express server on one port, bind 0.0.0.0:$PORT); Drizzle schema for every table in PRD section 7; `npm run db:push`; `server/seed.ts` + `npm run seed` loading fixtures/seed.json (relative daysAgo times, upload fixture images to App Storage, pre-fill the extractions cache with each fixture's sha256 → its *.expected.json); `server/core-adapters.ts` mapping DB rows ↔ shared/core types. Check: `npm test` shows 82+ passing; seed runs twice idempotently; GET /api/health ok.
M1 Design system + shell + auth: tokens and type from PRD 6.1–6.2 in index.css + Tailwind @theme; DM Sans; restyled shadcn Button/Card/Sheet(bottom)/Tabs/Input/Badge; sonner toasts; bottom tab bar with centre Scan button; sticky blurred action bar; i18n ms/en with all PRD 6.6 keys; PIN login with keypad, dots and a shake on a wrong PIN; jose cookie session; requireRole middleware. Check: owner PIN 1234 and staff PIN 5678 work; a wrong PIN shakes; staff calling POST /api/flags/x/approve gets 403; nothing looks like default shadcn.
M2 Capture + storage: /scan sheet (Pesanan / Invois / Bon) → camera or file; client downscale (createImageBitmap from-image → 1600px JPEG 0.85); PDF page 1 via pdfjs-dist; upload with a progress ring; POST /api/documents to App Storage keyed by sha256; authed file streaming. Check: upload a photo and a PDF; the thumbnail renders; the same file twice reuses the sha256.
M3 The reading moment (hero UX): POST /api/documents/:id/extract using shared/core/extract.ts (cache by sha256, maxRetries 0, Flash → Flash-Lite on 429/5xx, 45 s timeout → manual); checks_left decrements on real calls only; /read/:documentId shows the scan-beam animation, then draws each box_2d on the image with a stagger while rows slide in; after 12 s show "Masih membaca…"; with DEMO_FIXTURES=1 show "Guna bacaan demo" (fixture picker); on failure go to manual entry. Check: uploading fixtures/docs/invoice_borong_ali_INV-2291.png returns 4 lines with boxes over the right rows (cache hit from the seed, no Gemini call).
M4 Review screens: /review/po and /review/invoice with inline-editable rows linked both ways to their boxes; supplier fuzzy picker or new supplier; PO numbering via poNumber with a monthly sequence; invoice: PO suggestion chip from rankPoCandidates with a dropdown; foreign banner via looksForeign; lines-vs-printed-total check; lines matched to PO skus with matchLine on save. Check: the INV-2291 fixture suggests PO-2610-004 first; the GZ invoice shows the foreign banner.
M5 Counts → flags: /invoices/:id/count with big steppers prefilled with invoice qty (changed lines glow), delivery + signed-bon photo tiles, greyed PO-only lines at 0; PUT counts runs detectFlags and replaces Proposed flags; animated result card; /flags list with segmented tabs. Write server/api.test.ts (supertest or fetch against the app): staff can save counts; counts {maggi-kari: 8} on INV-2291 vs PO-2610-004 produce exactly Maggi short 9000 sen + Gula price 2000 sen. Check: the UI shows "2 perbezaan ditemui · RM110.00".
M6 Flag detail + approval + message: /flags/:id with the invoice cropped/zoomed to the highlighted line, facts table, baseline source chip, policy note, request selector, owner sticky actions (Lulus / Tolak / Laporkan harga / Ini kenaikan biasa / Diganti? Pautkan or Asingkan); /flags/:id/message with chat-bubble preview, BM/EN toggle, editable text from draftMessage, "Buka WhatsApp" via waLink and "Salin mesej"; POST /api/flags/sent sets sentAt. Check: approving both demo flags and opening the message shows the exact PRD section 11 text with the evidence link; staff sees "Menunggu kelulusan pemilik" and no actions.
M7 Evidence page: public /e/:token using GET /api/public/evidence/:token (buildEvidence output only + shop/supplier names + siblings); pulsing highlighted line on the invoice; signed bon and delivery photos with zoom; BM/EN; X-Robots-Tag noindex + meta robots; photos only through the token route. Add tests: a proposed flag's token → 404; payload has no owed totals or other flags' data. Check: open the link logged out in a fresh browser context.
M8 Money + lifecycle: dispute/reopen/settle sheets via transition (redelivered only for short); /suppliers and /suppliers/:id money header from supplierLedger (Pay now, Dipertikai, Pembekal berhutang, Baki penyata dijangka) with NumberFlow; invoice payment (on credit / paid, due date) and Mark correct (canMarkCorrect, owner); Home hero from last30Days with NumberFlow, "Perlu tindakan", "Perlu susulan" from needsReminder with a "Hantar peringatan" re-send; /activity timeline from events. Check: after seeding and uploading INV-2291, Borong Ali Pay now = RM962.00; settling the Maggi flag as Nota kredit rolls it to RM872.00; Lim Brothers shows under Perlu susulan and Dipertikai RM12.50.
M9 Extras: self-billed e-invoice preview for foreign invoices (prepareSelfBilled/approveDraft/releaseDraft, red "Pratonton, tidak dihantar ke LHDN" ribbon, owner only); CSV export; /settings (language, switch user, checks left, export, Reset demo in dev, the "Demo menggunakan dokumen sintetik" note); the substitution demo using the Kilang Roti Sinar fixtures. Check: GZ-2026-088 → preview shows type 11, TIN EI00000000030, USD 610.00 (from unit_price_foreign_minor); release only logs an event; Kilang Roti Sinar substitution: Pautkan yields no flag.
M10 Polish + ship: walk every screen against PRD 6.8 and fix every miss (skeletons, empty states, stagger, layoutId card→detail, press-scale, reduced motion, BM strings at 360px, no layout shift); Lighthouse mobile Perf ≥ 85 and A11y ≥ 95; run the full PRD section 12 demo script end to end in App Testing twice; prepare the Reserved VM deployment config. Check: the demo script passes with zero manual fixes; `npm test` is green.

START NOW with Plan mode output: a short plan restating M0–M10 and confirming you will treat shared/core as read-only. Then build.
```

---

## C. Continue prompt (when the Agent pauses between milestones)

```text
Continue with the next unticked milestone in docs/PROGRESS.md, following replit.md and docs/PRD.md. Don't ask me questions; log decisions in docs/DECISIONS_LOG.md. Run npm test + App Testing before ticking it, then keep going.
```

## D. Recovery prompts (use the one that matches)

**Tests are red:**
```text
npm test is failing. Do not edit shared/core or fixtures. Read the failing test, find which call site passes the wrong data (usually a float, a missing sku, or ms-vs-Date), fix the call site, and re-run until green. Then continue the milestone.
```

**Agent is looping or re-implementing logic:**
```text
Stop. You are re-implementing logic that already exists. Re-read replit.md ("shared/core is read-only golden logic") and PRD section 10. Delete your duplicate logic and call the shared/core function instead. Then continue the current milestone.
```

**Gemini 429 / quota / slow reads:**
```text
Gemini is rate-limited. Make sure the extract route: checks the extractions cache by sha256 first; calls extractWithFallback with maxRetries 0; returns {status:'manual'} on failure; and with DEMO_FIXTURES=1 shows the "Guna bacaan demo" fixture picker after 12 s. Do not add retries loops. Re-test with fixtures/docs/invoice_borong_ali_INV-2291.png (a cache hit after seeding).
```

**UI looks generic or drifted:**
```text
The UI is drifting from the premium bar. Re-read PRD section 6 (tokens, type, components, motion, polish checklist 6.8). For every screen: replace raw Tailwind colours with the tokens, put tabular-nums on every number, use NumberFlow on changing RM totals, bottom sheets instead of dialogs, layout-matched skeletons instead of spinners, a 40 ms list stagger, press-scale buttons, a sticky blurred action bar. Screenshot each screen at 390px in App Testing and fix until it passes 6.8.
```

**Wrong numbers on screen:**
```text
An RM figure is wrong. Every amount must come from shared/core (detectFlags, supplierLedger, monthSummary) via server/core-adapters.ts, with times converted to ms epoch and money in integer sen. Find the screen's data path, remove any arithmetic outside core, and add an assertion to server/api.test.ts reproducing the PRD section 12 numbers (RM90.00, RM20.00, RM962.00 → RM872.00).
```

**Deploy or evidence link problems:**
```text
Evidence links must use PUBLIC_BASE_URL (the .replit.app URL) and work logged out. Check the public routes skip auth, photos stream only via /api/public/evidence/:token/photo/:documentId, and the production DB has been seeded. Publish as a Reserved VM.
```

## E. Hand-off to Claude Code (after M10)
1. Replit Git pane: Pull → Push to `main`.
2. In Claude Code: "Read replit.md, docs/PRD.md, docs/PROGRESS.md and docs/DECISIONS_LOG.md. Review the app against the PRD, run npm test, then polish the weakest screens against PRD 6.8 and fix any bugs. Keep shared/core green."
3. Any follow-up changes go through GitHub; in Replit, **Pull** before asking the Agent for more.
