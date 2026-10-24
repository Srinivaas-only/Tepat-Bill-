# HANDOFF: Tepat Bill (read this first in a new Claude Code chat)

> Written 2026-10-24. `main` = latest commit (see `git log`). The previous handoff (stale, written at `baf6bc1`) is archived at `docs/HANDOFF_ARCHIVE_2026-10-23.md`; use it only for product background (§2 there) and history.
> Team **Alt+Win+R**. Repo `Srinivaas-only/Tepat-Bill-`, branch `main` (pushing to `main` is allowed). Session dev branch may be `claude/*`; always push to `main` too.

## 1. Where we are (one paragraph)
Backend logic is **closed and verified** (Replit rounds 4–6 plus Claude review rounds; 202 tests, four demo scenarios, exact money). The UI has been rebuilt twice by Claude (Revolut-style Home, then a full **obsidian dark** theme) and polished (nav, intro, unified headers, animations). What is left is mostly **non-code**: deploying for friends, the hackathon submission, and optional polish. Replit credits are nearly exhausted, so **Claude does all work**; Replit is only used as the host.

## 2. Product in 30 seconds
"AI reads → rules decide → owner approves." A Malaysian kedai-runcit app: scan order/invoice/delivery note (Gemini reads), count the delivery, compare PO ↔ bon ↔ invoice, raise flags (short qty / price change / not ordered) with exact RM, owner approves and sends a WhatsApp message with a read-only evidence link, ledger tracks until settled. Money is integer sen. Roles: owner (everything) and manager (scan/count/save only). Public evidence page `/e/:token` (light "paper" page, no login). Gemini is the ONLY AI provider (`gemini-3.8-flash`, fallback `gemini-3.5-flash-lite`). Full spec: `docs/PRD.md` (§12 = demo script), rules in `replit.md`.

## 3. Rules from the user (follow them)
- Direct, no fluff. **Make decisions for me.** Use agents to cross-verify only when it adds value.
- Hates loops and wasted Replit credits. Dislikes AI-slop/generic UI; wants a premium, "out of this world" but tasteful feel (reference: Mobbin MCP, Revolut, Linear, Vercel, Raycast, WHOOP).
- `shared/core/*` and `fixtures/*` are Claude-owned golden logic: change only with tests green.
- **Do not merge, comment on or close PR #1** (teammate's "Tetapbill isaac") without the user's say-so.
- Never create PRs unless asked. Commit messages end with the attribution lines from the session reminder.
- User convention: when a block of work is done they like a plain "PORK!" style close-out; keep reports short and honest (say what was NOT verified).
- Mid-demo/outdoor use: contrast floor matters (text ≥ 4.5:1).

## 4. Current behaviour (new this session)
- **PIN screen on EVERY page load/reload** (`client/src/lib/auth.tsx` logs out on mount). `/e/:token` is exempt.
- After each login a **4-step skippable intro** plays (`components/intro.tsx`, state in `lib/intro.ts`; replay from Lagi → "Panduan ringkas"). Skip button = "Langkau" top-right, Esc also closes.
- Home headline numbers count up once the intro closes.

## 5. Design system (client/src/index.css is the source of truth)
- Tailwind v4 (`@theme inline`, `@utility`, no tailwind.config). Fonts: **Geist + Geist Mono self-hosted** (`@fontsource-variable/*`, CSP `font-src 'self'` in `server/index.ts`); Kalam still from Google (handwritten counts). After `git pull` on a machine, **run `npm install`** (fonts are new deps).
- Tokens: `--bg #09090B`, `--surface #121215`, `--surface-2 #18181B`, `--surface-3 #1F1F23`, `--sheet #1C1C1F`, `--ink #FAFAFA`, `--ink-2 #A1A1AA` (floor for text), `--ink-3 #8B8B94` (icons only), `--line` white/10, brand FILL `#2457D6`, brand TEXT `--brand-text #93B4FF` (use `text-brand-text`, never `text-brand` for text), status colours are light text values on 14% tints (`--short`, `--price`, `--notord`, `--ok`, `--dispute`).
- `.paper` wrapper = the ONLY light surface (evidence page). It redefines the tokens.
- Radii: chip 8 / input 12 / card 16 / sheet+nav 24; **all Buttons are pills**.
- Utilities: `press` (per-element `--p` scale, springy release), `btn` (+ ripple via `lib/ripple.ts`), `btn-shine`, `stagger` (children rise; uses `backwards` fill so `:active` scale still works), `spot` (desktop spotlight, `lib/spotlight.ts`), `edge` (gradient hairline border, used on Pay-now card), `glass`, `frosted`, `eyebrow` (the one caps label), `page-title`, `.aurora`/`.ambient`/`.grain` layers (rendered in `App.tsx`).
- Headers: `Page` (components/page.tsx) with `band` prop = title row over the aurora; detail pages use `BackButton` + `page-title`. Route transitions are direction-aware (deeper = slide from right, back = from left).
- Navigation: floating glass bar (76px) with a raised glowing Scan button (`components/bottom-nav.tsx`).
### Gotchas that already bit us
- **Never name a utility `overline`** (Tailwind owns it → stray lines). Use `eyebrow`.
- `cn()` uses tailwind-merge: a custom `text-caption`/`text-title` next to `text-ink-2` in the SAME `cn()` call gets dropped. Use explicit `text-[12px]` there.
- Focus-ring CSS is deliberately **unlayered** at the end of index.css (layered rules lose to utilities).
- Blur filters + mask on an animated layer dropped frame time to 33ms; the aurora uses plain radial gradients (17ms). Keep animations transform/opacity only.
- Don't put a `filter`/`backdrop-filter` on scrolling lists.

## 6. Verify in a fresh environment
```bash
# Postgres 16 (can't run as root; data dir outside the project). If /var/tmp/tb-pgdata is gone, initdb it (see archive §6).
rm -f /var/tmp/tb-pgdata/postmaster.pid
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/tb-pgdata -o '-p 5433 -k /var/tmp' -l /var/tmp/pg.log start"
export DATABASE_URL="postgresql://postgres@localhost/tepat?host=/var/tmp&port=5433"
npm ci   # (or npm install)
npm run typecheck && npm test        # 202 tests need DATABASE_URL; without it 56 are skipped
npm run build                        # from the REPO ROOT (building from client/ once produced a wrong dist)
NODE_ENV=production STORAGE_DRIVER=disk DEMO_FIXTURES=1 SEED_ON_BOOT=1 OWNER_PIN=1234 STAFF_PIN=5678 \
 SESSION_SECRET=0123456789abcdef0123456789abcdef PORT=5077 sh -c "npm run db:push; node dist/index.js"
# health: http://localhost:5077/api/health  → ok, db, seeded all true (gemini false without a key)
```
- Stop the server with `fuser -k 5077/tcp` (NOT `pkill -f`, it kills your own shell).
- Postgres stops when the sandbox sleeps; if `/api/health` shows `db:false`, restart it as above.
- Playwright MCP needs the wrapper `/opt/google/chrome/chrome` (shell script exec'ing `/opt/pw-browsers/chromium-*/chrome-linux/chrome --no-sandbox "$@"`); screenshots must be saved under `<repo>/.playwright-mcp/` (gitignored). First screenshot after navigate can be blank: wait ~1s.
- Because the app now forces login on every load, **scripted tests must**: log in, click "Langkau" if the intro shows, then navigate inside the app (`history.pushState` + `popstate`) instead of `page.goto`.
- Demo reset: log in as owner and POST `/api/dev/reset` (or Settings → Set semula demo).
- Expected demo numbers: Home 85.80 flagged / 31.90 settled / 53.90 open; scenario 1 "PENGHANTARAN TEPAT"; invoice LB-7810 "INVOIS TEPAT · RM285.60"; bon DO-5512 Maggi 10→8 "Anggaran RM90.00"; INV-2291 vs DO-5512 "2 perbezaan · RM110.00"; supplier Pay now RM962.00 → RM872.00 after the credit note.
- Button labels the e2e depends on (do not rename): Lulus, Abaikan, Hantar, Pertikai, Selesaikan, Simpan kiraan, Simpan invois, Lihat aduan, Hantar semula, Nota kredit, Ditolak daripada invois, Tandakan sudah dibayar, Sahkan tepat, Lihat bukti, Salin pautan, Langkau, Seterusnya, Mula guna.
- Known harmless false FAIL in old scripts: "superseded caption" (case-sensitive regex).

## 7. Deploy so friends can test (Replit as host, no credits for running tests)
1. Repl → Shell: `git pull origin main` then `npm install`.
2. Secrets: `OWNER_PIN`, `STAFF_PIN` (4 digits each, different), `SESSION_SECRET` (32+ chars), `GEMINI_API_KEY`, `DEMO_FIXTURES=1`, `SEED_ON_BOOT=1`; enable Replit Postgres (`DATABASE_URL`).
3. Deploy (Autoscale) → check `<url>/api/health` (`ok, db, seeded, gemini` true), log in as owner, Settings → Set semula demo. Give friends the **staff PIN** only. Owner can call `POST /api/gemini-check` once to prove the key/models.
4. Demo has 50 AI reads ("Baki semakan"); reset between testers.
- **Vercel is not suitable** (needs a long-running Express server + persistent uploads). Alternatives that cost nothing: run locally + Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:5000`), or Render/Railway (+ a persistent disk or Neon Postgres).
- Not yet verified by Claude: the live Replit deploy (storage "replit", PINs, real Gemini read, WhatsApp button on a real phone).

## 8. Open items (ranked)
1. **Submission:** deadline reportedly **25 Oct 2026 23:59 MYT (unverified; today is 24 Oct)**. The three submission PDFs named `SDC2026_TeamName_*` are placeholders and must be rewritten with "Alt+Win+R" content (files live on `origin/tetapbill_isaac`; PR #1 stays untouched).
2. Deploy + smoke-test on Replit (§7); one real phone test.
3. RunPod: ask the organiser; stay Gemini-only; only build a flag-gated non-blocking job if the organiser says it is mandatory.
4. Optional polish (user wants "out of this world, no AI slop"): the deeper screens (Count, Compare, Review, Read, E-invoice) were only re-skinned by tokens + headers, not redesigned; ideas: a custom count screen, a celebratory "INVOIS TEPAT" moment, shared-element list→detail transitions, richer empty states. Always Mobbin-reference first, keep motion transform/opacity only, verify frame time (p95 ≤ 17ms), CLS 0, no overflow at 360/390.
5. Preview artifact (`pv/`) is stale; refresh only if asked.
6. Ask before any destructive/outward action. `npm audit fix` is NOT wanted (11 moderate/1 high dev-tool warnings are accepted).

## 8b. Codex audit fixes done on 2026-10-24 (all on `main`)
Critical: one quantity record (LB-7781 root cause fixed), count-screen Back crash, per-invoice dispute cap, foreign-line clamp. High: fulfilment view, owner-confirmed completion (`confirm` state), draft preview before approval, delivery evidence into complaints, owner-reviewed recounts (`needsRecheck`), unverified price source, supplier acceptance (accepted amount + ref). Medium: accurate WhatsApp/activity wording, labelled accounting simulation. Detail: `docs/DECISIONS_LOG.md` (2026-10-24 Codex lines). 225 tests green. Still NOT verified: live Replit deploy, real Gemini read, phone camera/WhatsApp. Not done on purpose: deck edits, Python ledger merge, real Orbyte/LHDN integration.

## 9. Git state
- `main` carries everything. Rollback tags: `pre-ui-redesign` (before the Revolut Home), `pre-obsidian` (before the dark theme). Key commits: `65b6a1c` Revolut Home, `65c67f0` obsidian dark, `ea1f329` nav, `114f013` login/intro/headers/animations.
- Decision log: `docs/DECISIONS_LOG.md` (append a line for every notable choice). Replit prompts for reference: `docs/FIX_PROMPT_4.md`–`6.md` (all executed).
