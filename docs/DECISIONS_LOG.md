# Decisions log

> Agent: when the PRD doesn't cover something, choose the simplest option consistent with it, append one line here, and keep building. Don't ask.
> Format: `YYYY-MM-DD · area · decision · why`

- 2026-10-22 · kit · Final product decisions live in PRD section 15; this log is for implementation-level choices only.
- 2026-10-23 · runtime · Replit module is nodejs-20 (not 22); Vite 8.3.5 runs fine on 20.20. · avoids editing the generated .replit.
- 2026-10-23 · schema · Added invoices.price_list_snapshot, exchange_rate_bp, documents.invoice_id per IMPLEMENTATION_NOTES. · notes override PRD.
- 2026-10-23 · seed · Seeded invoices get price_list_snapshot = pre-invoice list (empty for first Borong Ali invoice) as fixtures.test.ts does. · keeps re-detection consistent.
- 2026-10-23 · testing · Per user: short App Testing passes at end of M3, M7, M8a plus one full pass at M10; between milestones use API checks/screenshots. · user instruction.
- 2026-10-23 · ui · shadcn components written by hand in shadcn style (Radix + cva + tokens) instead of running the CLI; components.json still present. · avoids CLI prompts/network; same result.
- 2026-10-23 · css · Base resets live in @layer base so Tailwind utilities (font weight) win over them. · unlayered button reset was overriding utilities.
- 2026-10-23 · extract · shared/core/extract.ts `ExtractedDoc` uses z.tuple for box_2d; Gemini returns 400 on the resulting JSON-schema (`items` array) for BOTH models, so every live read fails. Core left untouched; server/gemini.ts re-runs the same prompt/options/fallback with a wire schema (array of 4 ints) and validates the result with core's ExtractedDoc. · core is read-only; work around at call site. RESOLVED in core 0ece73e: server/gemini.ts deleted, route uses extractWithFallback from core.
- 2026-10-23 · scan · Manual entry route is /review/{kind}/new?doc=<documentId> so the uploaded image stays attached; bon upload goes to /bon/:docId (attach sheet built in M5). · notes only specify /new.
- 2026-10-23 · read · `/read/:id?hold=<ms>` (max 10s, never below the spec's 1.4s) lengthens the beam so testers can observe it.
- 2026-10-23 · api · PO suggestion for an unsaved invoice is `POST /api/po-suggestions` (supplier name + line descriptions); the saved-invoice GET variant is not built. · the review screen needs the chip before the invoice exists.
- 2026-10-23 · tests · api.test.ts rebuilds schema `test` each run (tables cloned LIKE public INCLUDING ALL) and seeds it; dev data untouched. · notes 34.
- 2026-10-23 · counts · Count screen photos upload as kind `photo` (delivery) or `delivery_note` (signed bon) with invoice_id; flags pick up all invoice documents on every save/attach. · notes 21.
- 2026-10-23 · flags · A first message drafts this flag plus the invoice's other open, unsent flags; a reminder drafts this flag plus siblings with the same sentAt still open/disputed. · notes 23.
- 2026-10-23 · flags · link-substitute: the matched line's count = its saved `line:` count if staff set one, else its billed qty (matched lines default to billed qty per notes 13); the PO sku count key is dropped. · the not_ordered line has no count of its own before matching.
- 2026-10-23 · ui · Flag detail crop is a CSS-transform window (220px, zoom clamp 1-4); pinch/zoom (react-zoom-pan-pinch) only in the full-screen viewer. · avoids library timing issues for the static crop.
- 2026-10-23 · fix-round-1 · started; items done are listed in docs/PROGRESS.md fix-round section
- 2026-10-23 · deploy · smoke ran on port 5056 (5055 may be held by an old process); .replit [[ports]] 5055 entry removed; run command set via deployConfig to db:push then start.
- 2026-10-23 · SKIPPED · items 30, 31, 32, 33, 34 · P3 optional, not attempted (budget); item 36 partly done (focus-visible radius, --safe-top, open=brand); hex tokens, keypad keys, img alt audit not done
- 2026-10-23 · decision · item 21 price_list has no description column, so near-match uses the sku slug text as description; item 27 CSV rm() uses formatRM minus "RM" (thousands separators now appear in quoted cells)
