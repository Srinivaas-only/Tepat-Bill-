# HANDOFF: Tepat Bill (full context for a new Claude Code chat)

> Written 2026-10-23 at `main` = `baf6bc1` (Replit's Fix Round 3 push). Everything a new chat needs to continue without asking: the product, the repo, the history, how to verify, how to work with Replit, what's left, and how the user likes to work.

---

## 0. Paste this as the first message in the new chat

```text
You're taking over the Tepat Bill hackathon app (repo Srinivaas-only/Tepat-Bill-, branch main). Read HANDOFF.md at the repo root completely before doing anything, then docs/PRD.md, replit.md, docs/IMPLEMENTATION_NOTES.md, docs/FIX_PROMPT_3.md and docs/PROGRESS.md.

Then do section 1 "First actions" of HANDOFF.md, in order:
1) Independently verify Replit's Fix Round 3 (its claims are NOT verified by Claude yet): set up local Postgres, run npm test / typecheck / build, run the built app, and drive the 4 scenarios + the demo path with Playwright at 390px and 360px, with screenshots.
2) Run 3 parallel read-only Explore audits (functional, UI/design, demo-day/deploy) on main.
3) Report back to me: verified vs claimed, a ranked defect list, and the remaining roadmap.
4) If code fixes are needed, write ONE docs/FIX_PROMPT_4.md for Replit (same anti-loop rules R1–R6, the FINISH report format) and push it to main.

Rules: be direct, no fluff; make decisions for me; use agents to cross-verify; Gemini is the only AI provider; never edit shared/core or fixtures casually (they're Claude-owned golden logic: change them only with tests green); don't merge PR #1 as-is (see HANDOFF.md §9).
```

---

## 1. First actions (in order)

1. **Verify Fix Round 3 yourself** (§6 has the exact commands). Replit claims:
   - P0.1–P0.14, P1 (S1–S6 + T1–T12 in `server/scenarios.test.ts`), P2 U1–U18 + most of U20, P3 F1–F20 and P4 L1–L10 are done;
   - **131/131 tests**, typecheck, build and production smoke OK;
   - App Testing at 390px a–i OK.

   Nobody independent has checked any of this yet.
2. **Drive the four scenarios and the demo path in a real browser** (Playwright + Chromium are installed here). Assert the numbers in §2.4. Take screenshots of every screen for a design critique (the user hates "AI slop").
3. **Run three parallel read-only Explore audits on `main`:**
   - functional: every PRD story, API, money, data integrity, security;
   - UI/design: the paper/ink/stamp system, 360/390px layout, BM copy, a11y;
   - demo day and deploy.

   This pattern has found real bugs every round.
4. **Report to the user**, then write `docs/FIX_PROMPT_4.md` **only if needed**, for what Round 3 missed or broke. Same structure as `docs/FIX_PROMPT_3.md`.
5. **Resolve PR #1 safely** (§9), deploy (§8), and hand the user `docs/DEMO_DAY_CHECKLIST.md`.

Items Round 3 itself lists as **not verified**:
- the superseded-flag UI after its 409 fix;
- the 360px layout of the new supplier settings card;
- the WhatsApp contact picker on a real phone;
- Lighthouse;
- App Storage in production (its smoke test used local disk).

**Skipped:** U19 (deleting unused i18n keys).

---

## 2. The product

### 2.1 What and why
**Tepat Bill:** *"Semak setiap penghantaran. Semak setiap bil."* (Check every delivery. Check every bill.)
- **Who it's for:** a mobile-first, Bahasa Malaysia–first web app for Malaysian *kedai runcit* (small grocery shops).
- **What it does:** catches short deliveries, wrong items and wrong invoices before the shop pays.
- **Hackathon:** SDC Hackathon 2026, Domain 2, **Orbyte Smart SME Challenge**. The team must *use Replit to build* the app; Claude/Codex may polish it.
- **Source documents** (from the user's first chat; not in the repo):
  - `SPEC_TepatBuild.md`: the spec, with 35 user stories;
  - an 11-slide deck, "Tepat Bill latest.pdf".

  All of their content was folded into `docs/PRD.md`.

**Principle: AI reads → rules decide → the owner approves.**
- The app never sends, pays or settles anything by itself.
- It never decides who is right.
- It makes no "% time saved" claims.

### 2.2 Roles
| Role | Access |
|---|---|
| Owner | PIN (`OWNER_PIN`). Can do everything. |
| Staff | PIN (`STAFF_PIN`). Can view, upload, correct AI reads and record counts. Cannot approve, send, settle, mark paid or correct, set prices, edit suppliers, export, or touch e-invoices. |
| Supplier | No login. Gets one public, read-only evidence page at `/e/:token`. |

Permissions are enforced server-side with `can(role, action)` from `shared/core/roles.ts`.

### 2.3 Workflow (two phases, as on deck slides 4–5)
1. **Order (PO).** Snap a notebook page, a WhatsApp screenshot, or type it in. Gemini reads it, the owner corrects it, and it's numbered `PO-YYMM-###`.
2. **Delivery** (bon / DO). Scan the DO → review → count what arrived. `checkDelivery` then:
   - finds nothing → **"PENGHANTARAN TEPAT"**, and the owner taps *Sahkan tepat* (scenario 1);
   - or raises **delivery-stage flags** (short qty or not ordered) carrying an **estimate** ("Anggaran RM…") that never enters money (scenario 2).
3. **Invoice** (photo, screenshot or PDF page 1). Read → review. The app suggests the PO and the unlinked delivery; the owner can choose "Tiada penghantaran" for the old count-on-invoice flow. On save, `receivedFromDelivery` + `detectFlags` compare it **without a recount**:
   - **"INVOIS TEPAT · Sedia untuk dibayar RM…"** → *Tandakan sudah dibayar* (scenario 3);
   - **"N perbezaan · RM…"** (scenario 4).

   A matching delivery flag becomes **superseded** ("Dibawa ke invois"), so nothing is counted twice.
4. **Flags.** Short qty, price change (baseline: agreed → PO price → last invoice) and not ordered (with a substitution guard, *Pautkan* / *Asingkan*). They start as **Perlu semakan**, then the owner either:
   - approves with a request (deduct, send missing, collect back, or agreed price);
   - dismisses with *Abaikan* ("Ini kenaikan biasa" updates the baseline);
   - or uses *Laporkan harga*, which sets the agreed price and approves.
5. **Message.** Exact factual BM/EN text from `draftMessage`. The owner edits it, then taps *Buka WhatsApp* (`wa.me`; seed suppliers have **no number**, so WhatsApp's contact picker opens) or *Salin mesej*.
6. **Evidence.** The supplier opens `/e/:token`: PO, invoice/DO, the **highlighted line** (static, no pulse), photos including the signed bon, the price baseline, the status stamp. No amounts owed.
7. **Lifecycle and money.**
   - Flags move Terbuka ↔ Dipertikai (with a note) → Selesai: *Dihantar semula* (short only), *Nota kredit* or *Ditolak daripada invois*.
   - A follow-up reminder appears 14 days after sending.
   - `supplierLedger` gives Pay now / Dipertikai / Pembekal berhutang (supplier credit, carried to the next invoice) / Baki penyata dijangka.
   - Disputed amounts stay owed.
8. **Home** (`last30Days`): RM flagged / settled / open, plus needs action, follow-ups, credits and recent activity.
9. **Extras:**
   - activity log;
   - CSV export;
   - "Baki semakan" chip (illustrative, no billing);
   - self-billed e-invoice **preview stub** for foreign suppliers (type 11, TIN `EI00000000030`, never submitted to LHDN).

### 2.4 Demo numbers (all asserted in tests)
- **Fresh seed, Home:** RM85.80 flagged / RM31.90 settled / RM53.90 open. Lim Brothers appears under *Perlu susulan*; Borong Ali shows "Pembekal berhutang RM31.90".
- **Scenario 1:** `fixtures/docs/do_lim_brothers_DO-LB-0901.png` against PO-2610-006 → no flags.
- **Scenario 2:** `fixtures/docs/bon_signed_DO-5512.png` against PO-2610-004, Maggi 10 → 8 → one delivery flag, estimate **RM90.00**.
- **Scenario 3:** `fixtures/docs/invoice_lim_brothers_LB-7810.png` linked to delivery 1 → ready to pay **RM285.60**.
- **Scenario 4:** `fixtures/docs/invoice_borong_ali_INV-2291.png` linked to delivery 2:
  - flags: Maggi short **RM90.00** + Gula +RM0.40 × 50 = **RM20.00** → "2 perbezaan · **RM110.00**";
  - Borong Ali Pay now **RM962.00** (993.90 − 31.90 credit) → settle Maggi → **RM872.00**.
- **Other seeded figures:**
  - Lim LB-7781: Dipertikai RM12.50; Pay now RM581.20.
  - GZ-2026-088 (foreign, USD 610.00 × 4.2 = RM2,562.00) → e-invoice preview.
  - Kilang Roti Sinar: substitution demo (kaya ordered, mentega jagung delivered).
- **Demo script:** PRD §12, updated by Round 3 to the four scenarios, about 120 s, on two phones plus a projector mirror.

---

## 3. Repo map (at `baf6bc1`)

**Owned by Claude: golden or kit files that Replit must not edit**
| Path | What |
|---|---|
| `shared/core/rules.ts` | `detectFlags`, `matchLine`, `tokenOverlap`, `normalise`, `baseline`, `autofillPriceList`, `setAgreedPrice`, `learnAlias`, `poNumber`, `rankPoCandidates`, `looksForeign`, `formatRM`, `parseRM`, `assertSen`/`assertQty` |
| `shared/core/ledger.ts` | `transition`, `markSent`, `supplierLedger` (owed/disputed/payNow/creditCarry/recovered/rows), `needsReminder`, `orderState`, `canMarkCorrect`, `monthSummary`, `rangeSummary`, `last30Days`, `defaultDueAt` |
| `shared/core/delivery.ts` | `checkDelivery`, `receivedFromDelivery`, `readyToPay`, `claimableSen` (two-phase) |
| `shared/core/messages.ts` | `draftMessage` (exact BM/EN templates), `waLink`, `toMsisdn` |
| `shared/core/evidence.ts` | `buildEvidence` (whitelist) |
| `shared/core/einvoice.ts` | `prepareSelfBilled`, `approveDraft`, `releaseDraft` (stub) |
| `shared/core/roles.ts` | `can`, `ACTIONS` |
| `shared/core/extract.ts` | **Server-only** Gemini reader: `MODELS`, `ExtractedDoc` (box = a 4-number array, not a tuple), `EXTRACTION_PROMPT`, `extractWithFallback`, `geminiOptions`, `cacheKey`, `linesToSen` |
| `shared/core/index.ts` | Browser-safe barrel (everything except `extract.ts`) |
| `shared/core/*.test.ts` | Core tests; `fixtures.test.ts` reconciles the fixtures, the seed and the four scenarios |
| `fixtures/docs/*.png` + `*.expected.json` | 9 synthetic documents with **true** `box_2d` |
| `fixtures/seed.json` | Suppliers, price list, POs 001–006, invoices, flags, events, `demo.scenarios` |
| `fixtures/_generator/` | `docs.mjs` (HTML templates) and `generate.mjs` (Playwright render; `node fixtures/_generator/generate.mjs <file>` renders just that file) |
| `replit.md` | Standing rules Replit reads every run (Replit appends only to "Agent notes") |
| `docs/PRD.md` | Product requirements. §6 design is superseded by the paper/ink/stamp redesign in FIX_PROMPT_2/3 |
| `docs/IMPLEMENTATION_NOTES.md` | Exact wiring and data rules (overrides the PRD where they differ) |
| `docs/BUILD_PROMPT.md` | Original master prompt + runbook |
| `docs/FIX_PROMPT_1/2/3.md` | The fix rounds |
| `docs/DEMO_DAY_CHECKLIST.md` | Human-only checklist |
| `TECH_STACK.md`, `README.md`, `HANDOFF.md` | Docs |

**Built by Replit**
| Path | What |
|---|---|
| `server/index.ts`, `server/app.ts` | Boot checks, compression, static/SPA, `createApp(deps)` |
| `server/db.ts` | pg pool (error handler, keep-warm) |
| `server/storage.ts` | App Storage with a lazy probe and disk fallback; `driver` field |
| `server/auth.ts` | jose cookie `tb_session`, PIN limiter, `requireAuth`, `requireCan` |
| `server/core-adapters.ts` | Rows ↔ core types, `toMyrSen`, `mintSkus`, `nearSku` |
| `server/flags.ts`, `flag-ops.ts`, `flag-view.ts`, `delivery-ctx.ts`, `ledger-data.ts`, `events.ts` | Detection plumbing, views, ledger data |
| `server/routes/*.ts` | `auth`, `documents`, `extract`, `orders` (POs/invoices/po-suggestions), `counts`, `deliveries`, `flag-actions`, `messages`, `money`, `evidence` (public), `home`, `extras` (e-invoice, CSV, checks, reset, fixtures), `stubs` |
| `server/seed.ts` | Seed + reset, run inside a transaction; keeps the `extractions` cache |
| `server/api.test.ts`, `server/scenarios.test.ts` | API tests on a cloned `test` schema; skipped without `DATABASE_URL` |
| `shared/schema.ts` | Drizzle tables: suppliers, documents, extractions, purchase_orders, po_lines, invoices, invoice_lines, received_counts, price_list, aliases, flags (`stage` / `delivery_id` / `superseded_by`), flag_photos, einvoice_drafts, events, settings, deliveries, delivery_lines, delivery_counts |
| `client/src/pages/*` | login, home, scan, read, review, count (invoice and delivery mode), compare, flags, flag-detail, suppliers, supplier-detail, orders, order-po, invoice-detail, einvoice, activity, settings, more, bon, evidence |
| `client/src/components/*` | stamp, radio-row, flag-card, message-sheet, doc-image, line-crop, photo-viewer, scan-beam, page (SectionLabel, ErrorState, BackButton), bottom-nav, ui/* |
| `client/src/i18n/ms.ts`, `en.ts` | BM default, EN toggle; identical key sets |
| `.replit`, `package.json`, `vite.config.ts`, `tsconfig.json`, `drizzle.config.ts`, `components.json`, `.agents/memory/*` | Config. `.agents/memory` is Replit's own memory |

---

## 4. Stack and key technical facts
- **Client:** React 19, Vite 8, TypeScript, Tailwind 4 (`@tailwindcss/vite`, no config file), hand-written shadcn-style components (Radix + cva), `motion`, `@number-flow/react`, `sonner`, `lucide-react`, `wouter`, TanStack Query, `react-zoom-pan-pinch`, `pdfjs-dist` (lazy).
- **Server:** Express 5 (wildcard route is `/{*splat}`), multer, jose, Drizzle + Replit Postgres, `@replit/object-storage`, compression.
- **AI (Gemini only):**
  - `gemini-3.8-flash` (thinking `low`; media resolution high) → `gemini-3.5-flash-lite` on 429/404/5xx/invalid output → fixture → manual entry;
  - `maxRetries: 0`; per-model time budgets of 20 s and 15 s, 38 s server total;
  - the read cache is keyed by sha256 (`extractions`);
  - **never use Claude or any other provider** (the user's rule);
  - the user's own `GEMINI_API_KEY`, not Replit's AI integration.
- **Bug history:** a `z.tuple` box schema made Gemini reject every read with a 400 (the AI SDK emits draft-7 `items:[...]`). It was fixed in core `0ece73e`; a test now guards against it.
- **Money:**
  - integer **sen** everywhere; `formatRM` only at render time;
  - foreign amounts in minor units with `exchange_rate_bp`; `toMyrSen` only in the adapters;
  - **delivery-stage flags never enter money**.
- **Design system ("Paper, Ink, Stamp", from FIX_PROMPT_2/3; replaces PRD §6):**
  - **Colour:** paper `--bg #F5F3EC`, `--surface #FFFDF8`, `--line #E2DCCB`; ink `#13254A`; brand `#2457D6`.
  - **Surfaces:** no shadows or gradients; one radius (14px).
  - **Type:** IBM Plex Mono `.num` for numbers, DM Sans for text; Kalam is used **only** for changed counts.
  - **Components:** ledger rows with dashed dividers; rectangular outline chips; underline tabs; `Stamp` (SELESAI / DIPERTIKAI / PENGHANTARAN TEPAT / INVOIS TEPAT…).
  - **Motion budget:** only box draw-in, NumberFlow, sheets, the stamp thunk and the linear scan sweep. **No pulses, stagger, whileTap or glows** (the user called these "gimmicky").
- **Deploy (`.replit`):**
  - Reserved VM; build `npm run build`; run `sh -c "npm run db:push || echo …; npm run start"`;
  - `drizzle-kit`, `esbuild` and `tsx` are in `dependencies`;
  - module `nodejs-20` (ai@7 declares Node ≥22, but runs on 20.20; only switch to `nodejs-22` if you can re-test);
  - port 5000 → 80.
- **Secrets:** `GEMINI_API_KEY`, `SESSION_SECRET` (≥32 characters), `OWNER_PIN` ≠ `STAFF_PIN` (dev 1234 / 5678), `DEMO_FIXTURES=1`, `SEED_ON_BOOT=1`, optional `PUBLIC_BASE_URL` (https, `.replit.app`). **Never set `NODE_ENV` as a secret.**

---

## 5. History (what happened, so you don't redo it)
| Step | Commit(s) | Result |
|---|---|---|
| Tech stack chosen, then retargeted to Replit-native | `11306dd`…`c04871e`, `a4b9201` | Next.js + Supabase was dropped for Replit's React + Express + Postgres (fewer Agent loops) |
| Build kit (PRD, `replit.md`, BUILD_PROMPT, core, fixtures) | `a4b9201`…`9c4b889` | 82 core tests; two agent cross-checks; IMPLEMENTATION_NOTES from a dry run |
| Replit M0–M10 | `bc45272`…`0d28024` | Whole app built in one run. Replit found the core tuple bug |
| Core box fix + FIX_PROMPT_1 | `0ece73e`, `f1870af` | — |
| Replit FR1 (`98b1011`) | — | 25 of 30 items correct; deploy/reset/storage fixed; money roll-down working |
| FIX_PROMPT_2 (de-slop redesign) | `41feff7` | User feedback: "looks generic/template", "gimmicky motion" |
| Replit FR2 (`30ee06f`) | — | Bugs B1–B8 + paper/ink/stamp redesign + layout fixes; parts of U9/U10 and U12 skipped |
| Three audits (52 functional, 66 UI, 15 demo/deploy) + the user's 4 scenarios → delivery core + Lim fixtures + FIX_PROMPT_3 | `5b753eb` | 116 core tests |
| Replit FR3 | `5660a53`, `baf6bc1` | Claims nearly everything done (see §1); **not yet verified by Claude** |

**Decisions already made (don't relitigate):**
- **Name and roles:** Tepat Bill; Owner + Staff PINs.
- **Flag rules:**
  - "Wrong item" is built as `not_ordered`, with a substitution guard.
  - Baseline: agreed → PO → last invoice; a supplier's first invoice raises no price flag.
- **Money rules:**
  - *Dihantar semula* is for short qty only, and owed is unchanged.
  - Credit on a paid invoice carries to the next one.
  - Disputed amounts stay owed.
  - Reminder 14 days after sending.
- **Deck extras:**
  - E-invoice is a preview-only stub.
  - Pay-per-check shows as the "Baki semakan" chip.
  - Orbyte is pitched as "designed to plug into Orbyte".
- **Product scope:** PDFs: page 1 only. Home shows the last 30 days.
- **Hosting:** Replit Reserved VM.
- **Demo safety:** seed suppliers have no WhatsApp numbers (so the demo never messages a stranger); the evidence highlight is static.

---

## 6. How to verify in this environment (exact commands)

```bash
cd /home/user/Tepat-Bill-   # or wherever the clone is; git pull origin main first

# 1) Local Postgres 16 on port 5433. It can't run as root; the data dir must be outside the scratchpad.
PGBIN=/usr/lib/postgresql/16/bin; PGD=/var/tmp/tb-pgdata
[ -d $PGD ] || { mkdir -p $PGD && chown postgres:postgres $PGD && su postgres -c "$PGBIN/initdb -D $PGD -A trust -U postgres"; }
su postgres -c "$PGBIN/pg_ctl -D $PGD -o '-p 5433 -k /var/tmp' -l $PGD/log start"
psql -h /var/tmp -p 5433 -U postgres -c "create database tepat" 2>/dev/null || true
export DATABASE_URL="postgresql://postgres@localhost/tepat?host=/var/tmp&port=5433"

# 2) Install. The lockfile may contain Replit's internal registry; rewrite it temporarily, then restore it.
sed -i 's#http://package-firewall.replit.internal/npm/#https://registry.npmjs.org/#g' package-lock.json
npm ci --no-audit --no-fund && git checkout package-lock.json

# 3) Checks
npm run db:push && npm test && npm run typecheck && npm run typecheck:core && npm run build

# 4) Run the built app (no Gemini key needed: fixture uploads hit the seeded cache)
NODE_ENV=production STORAGE_DRIVER=disk DEMO_FIXTURES=1 SEED_ON_BOOT=1 OWNER_PIN=1234 STAFF_PIN=5678 \
SESSION_SECRET=0123456789abcdef0123456789abcdef PORT=5077 sh -c "npm run db:push; node dist/index.js"
# → http://localhost:5077 , health: /api/health
```

- **Browser:** Playwright is in `/opt/node-tools/node_modules/playwright`; Chromium is at `/opt/pw-browsers/chromium-*/chrome-linux/chrome`. Symlink `node_modules` into the script's directory, or set `NODE_PATH`. Viewports to check: 390×844 and 360×800.
- **Playwright demo script outline:**
  1. Log in with keypad 1234.
  2. Scan the DO, then each invoice fixture, via the file input.
  3. Count: Maggi 10 → 8.
  4. Approve flags; report the Gula price as 2.80.
  5. Open the message sheet.
  6. Open the evidence page in a fresh logged-out context.
  7. Settle → supplier page shows RM962.00 → RM872.00.
  8. Log in as staff.
  9. Assert the numbers in the DOM and save screenshots to the scratchpad.
- **Review checklist for any Replit push:**
  1. `git diff <prev> origin/main -- shared/core fixtures` must be **empty**;
  2. read `docs/PROGRESS.md` and `docs/DECISIONS_LOG.md` (SKIPPED lines);
  3. run the tests, typecheck and build;
  4. three parallel Explore audits;
  5. compare the claims against the code.
- **Fixture generator:** `ln -sfn /opt/node-tools/node_modules fixtures/_generator/node_modules && node fixtures/_generator/generate.mjs <file-name> && rm fixtures/_generator/node_modules`. Render only new files so the existing PNGs stay byte-identical; the seed caches reads by sha256.

---

## 7. Working with Replit (protocol that worked)
- **Prompts live in repo files.** The user pastes one short line: *"Pull is done. Open docs/FIX_PROMPT_N.md, copy the prompt inside the first ```text block, and execute it exactly… Follow rules R1–R6… end with the FINISH report."*
- **Anti-loop rules** (keep them):
  - R1: at most 2 attempts per item, then revert, log SKIPPED and move on.
  - R2: change only what an item names; no new dependencies; never touch `shared/core` or `fixtures`.
  - R3: tests + typecheck per section; browser testing only at FINISH.
  - R4: no questions.
  - R5: work in priority order.
  - R6: stay within the motion budget.
- **Prompt standards:**
  - Every reference (file:line, route, function) must be verified against `main` before writing.
  - Resolve every ambiguity in the prompt itself.
  - Include a deploy smoke test.
  - End with a fixed-format report (DONE / SKIPPED / TESTS / APP TEST / NOT VERIFIED).
- **Git hygiene:**
  - Before the user pastes a prompt in Replit: **Pull** in Replit's Git pane.
  - After Replit finishes: **Pull, then Push**.
  - Claude pushes kit and doc changes to `main` (allowed) and to `claude/dazzling-ritchie-1hkmlo`.
  - Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01BUm8rFeb3wbEiDtyM5AnCX`. Use the attribution the new session's system gives you if it differs.
- **Budget:** about $20 of Replit credits per round. Sonnet 5.5 at Medium, High for hard rounds. App Testing is on, but only one full pass at FINISH.
- **Replit quirks:**
  - It can't take screenshots behind login.
  - Its tester needs `OWNER_PIN` and `STAFF_PIN` overridden on the workflow.
  - It reports honestly in `PROGRESS.md`.
  - Its module is `nodejs-20`.

---

## 8. Remaining roadmap to win
1. **Verify FR3** (§1), then FR4 only for real gaps.
2. **Deploy:**
   - Publish as a Reserved VM with the secrets from §4.
   - Check `/api/health`: `storage` must read `replit`, not disk.
   - Reset the demo from Settings → *Set semula demo* (allowed when `DEMO_FIXTURES=1`).
3. **Real-world checks** (human only; see `docs/DEMO_DAY_CHECKLIST.md`):
   - Attach billing to the Gemini key.
   - Photograph the printed INV-2291 live: does the primary model return boxes? How long does it take?
   - Read 5+ real handwritten bons (spec requirement); log them in `docs/DECISIONS_LOG.md`.
   - `wa.me` on iOS and Android; the evidence page inside WhatsApp's in-app browser.
   - Two rehearsals on two phones.
4. **Submission:** PR #1 adds `submission/SDC2026_TeamName_{Preliminary,Replit_POU,TechDeclaration}.pdf`; these probably need the real team name (§9).
5. **Deck/PRD alignment:**
   - The deck still says "reads delivery photos". It should say "reads bons and invoices"; delivery photos are evidence only.
   - Show the two-phase flow (slides 4–5) exactly as built.
   - The BM message wording comes from core.
   - Pitch Orbyte as "designed to plug into".
6. **Demo morning:** reset ≤1 hour before; never open reminder messages after the reset.

---

## 9. PR #1 ("Tetapbill isaac", teammate ISAACTOHZHENYONG-2025): do NOT merge as-is
- It's based on `41feff7` (before FR2/FR3) and **moves the whole app into `src/`** (`server` → `src/server`, `shared` → `src/shared`, …). It also edits `tsconfig`, `vite` and `vitest` configs, the README, and adds `submission/*.pdf`.
- Merging it would conflict with FR2/FR3 and break every path in `replit.md`, the PRD, the prompts, `.replit` and the tests.
- **Do this instead:**
  1. Take only `submission/*.pdf` and any README text the teammate wants (`git checkout origin/tetapbill_isaac -- submission/`).
  2. Commit that to `main`.
  3. Comment on PR #1 explaining the folder move is not safe right before the demo. Ask the user before commenting or closing.
- Confirm with the user whether the team name in the PDFs needs filling in.

---

## 10. User profile and preferences (follow these)
- **Communication:** blunt and casual. Wants **direct answers, no fluff**, and decisions made for them ("just decide for me").
- **Rigour:** wants agents to cross-verify and question your own judgement before handing anything over. "Don't half-ass it."
- **Credits:** hates loops and wasted Replit credits. One complete prompt per round, with A–Z coverage.
- **Gemini only:** never propose Claude or another provider as fallback.
- **Design taste:** premium and crafted, **not "AI slop"**. Dislikes generic template looks and gimmicky motion.
- **Git:** pushing to `main` is fine (they asked for it). They push from Replit themselves.
- **Mid-task messages:** sometimes interrupts mid-task with a new priority. Address it immediately and keep the work coherent.

---

## 11. Gotchas (all of these happened)
- **Gemini schema:** `z.tuple` → draft-7 `items:[...]` → Gemini 400. Box must stay `z.array(z.number()).length(4)`.
- **AI SDK 7:**
  - `generateObject` is deprecated; use `generateText` + `Output.object`.
  - Images go as `{type:'file', mediaType}` parts.
  - `MockLanguageModelV4` is the offline test model.
  - Set `maxRetries: 0`, or the SDK retries twice and wraps the error in `RetryError`.
- **Gemini 3.8 Flash** rejects thinking level `'minimal'`; use `'low'`.
- **`tokenOverlap` is the overlap coefficient** (symmetric), so "Gula perang" ≈ "Gula pasir" at 0.67. Also require Jaccard ≥ 0.6 (`nearSku`).
- **Tailwind 4:** CSS outside a layer beats utilities. Put custom classes in `@utility` or `@layer`.
- **sonner** injects unlayered CSS. Style toasts through its CSS variables, not `className`.
- **Express 5:** wildcard routes are `/{*splat}`; mount `/api` and its JSON 404 before the SPA fallback.
- **Replit object storage:** `new Client()` never throws, so probe it with `exists()`; `downloadAsBytes` returns `r.value[0]`.
- **Lockfile:** it contains `package-firewall.replit.internal` URLs, unreachable outside Replit (see §6).
- **Postgres here:** `initdb` refuses to run as root, and the data dir must be readable by `postgres` (use `/var/tmp`).
- **Seed dates** are relative to seed time, so the 30-day Home figures drift. Reset on demo morning.
- **Opening a reminder:** used to log `flag.remind` on GET; it now logs on the POST of the send action (FR3 P0.13).
- **`wa.me` with no number** opens WhatsApp's contact picker, which is intended. Real numbers are deliberately absent from the seed.
- **Upload bytes:** the client re-encodes uploads only when needed, so fixture PNGs keep their sha256 and hit the seeded read cache.
