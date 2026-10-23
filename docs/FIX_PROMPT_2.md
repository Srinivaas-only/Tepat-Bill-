# Fix round 2: remaining bugs + "de-slop" redesign

> From the Claude Code verification of Fix Round 1 (`649c02e`) plus a 360/390px UI audit. Every file and line named below was checked on `main`.
> Pull first. Paste the block below in Build mode.

```text
FIX ROUND 2 — Tepat Bill. Round 1 landed well (25/30 items verified). This round does three things:
(1) the last bugs;
(2) a REDESIGN of the visual language: the app currently looks like a generic AI-made fintech template, with gimmicky motion. It must look like it belongs to a Malaysian kedai runcit: bon/ledger paper, ink, stamps;
(3) layout breakages at 360–390px.

The screen flow and all business logic stay exactly as they are.

ANTI-LOOP RULES (same as round 1, follow strictly)
R1. Max 2 attempts per item. If an item still fails: revert that item only, append `- <date> · SKIPPED · item <id> · <reason>` to docs/DECISIONS_LOG.md, and move on. Never retry a skipped item.
R2. Change only what an item names. No new dependencies (Google Fonts links are allowed). Never edit shared/core/* or fixtures/*. No money arithmetic outside shared/core (display-only NumberFlow excepted).
R3. After each section run `npm test` and `npm run typecheck`, and fix what you broke. Browser testing happens only at FINISH.
R4. Don't ask me anything and don't wait for me. Stop only after FINISH, with the report in the exact format.
R5. Order: P0 → P1 → P2 → P3. P0–P2 are must-do; do P3 only while everything is green.

P0. BUGS
B1. client/src/components/message-sheet.tsx:24-25 captures `reminder` in a useEffect, which runs after the first render, so the first fetch can use the stale key.
    - Fix: in the parent (flag-detail.tsx), render <MessageSheet key={msgOpenCount} …/> and increment msgOpenCount each time the sheet is opened.
    - Inside MessageSheet, use `const [rem] = useState(reminder)` and delete the useEffect.
B2. server/flags.ts:40-46 (no-PO implicit PO near-match):
    - pick the BEST-scoring existing price_list sku, not the first;
    - require tokenOverlap(desc, skuText) ≥ 0.6 AND tokenOverlap(skuText, desc) ≥ 0.6;
    - never assign the same sku to two lines of one invoice;
    - otherwise use the minted slug.
    - Add an api test: a no-PO invoice line "Gula perang 1kg" must NOT map to gula-pasir-1kg.
B3. server/flags.ts:114 autofill skip: also query the DB for skus of this supplier with an unresolved (proposed/open/disputed) price_change flag and add them to the skip set.
B4. client/src/pages/count.tsx (stepper long-press, ~lines 32 and 42): in apply(), if the clamped new value equals the current value, call stop() and return before buzz/onChange. This stops endless vibration at 0.
B5. count.tsx result sheet: list only flags with status 'proposed' that are not price decreases, so the list matches totalSen.
B6. server/routes/evidence.ts:46: build the fallback date from local date parts (like ymd() in seed.ts), not toISOString().
B7. client/src/main.tsx ErrorBoundary (~27-28): use ms['common.error'] and a new key 'common.reload' ("Muat semula" / "Reload"), added to ms.ts and en.ts.
B8. client/src/pages/read.tsx: if the use-fixture request fails, set fixtureChosen.current = false again.

P1. REDESIGN: "PAPER, INK, STAMP" (replaces the generic fintech skin)
Principle: it should feel like a shop's ledger book and a supplier's bon, not a crypto app. Flat surfaces, hairlines, ledger numerals, one accent colour, almost no motion.
D1. Tokens (client/src/index.css):
    - change --bg #F5F3EC, --surface #FFFDF8, --surface-2 #EEEBE1, --line #E2DCCB;
    - keep --ink #13254A, --ink-2, --brand #2457D6 and all semantic colours;
    - set --shadow-card to none and keep --shadow-elev only for sheets;
    - client/src/components/ui/card.tsx: rounded-[14px] bg-surface border border-line (no shadow, no /60).
    - Delete the radial-gradient overlay in home.tsx:74 and any other glow, blur blob, gradient or coloured ring (grep for radial-gradient, blur-, ring-short, shadow-elev on non-sheets).
D2. Ledger numerals: in client/index.html extend the Google Fonts link to also load IBM Plex Mono 400;500;600 and Kalam 400.
    - In index.css add `--font-mono: 'IBM Plex Mono', ui-monospace, monospace;` to @theme and a `.num` utility (font-family mono, tabular-nums, letter-spacing -0.01em).
    - Apply .num to: the Money component (client/src/components/ui/money.tsx; "RM" at 0.7em, --ink-2), all quantities, invoice/PO numbers, dates and the stepper numbers.
    - Text stays DM Sans. Weights: 400/500/600 only; 700 only for the hero amount.
D3. Ledger rows instead of floating cards, in: flags list (flags.tsx + flag-card.tsx), count lines (count.tsx), supplier invoices (supplier-detail.tsx), and the home lists (needs action, follow-ups).
    - Each group = ONE bg-surface border border-line rounded-[14px] container. Rows inside are separated by `border-t border-dashed border-line` (like a bon).
    - In flag-card.tsx, replace the icon-in-a-circle with a 3px left bar in the type colour (short=--short, price=--price, not ordered=--notord) plus a small type word. At most ONE chip per row (status).
    - Keep the layoutId on amount and chip.
D4. Ink stamp: new component client/src/components/stamp.tsx.
    - An outlined rotate(-6deg) uppercase label: 2px border in the colour, rounded-md, px-2 py-0.5, letter-spacing .08em, font-mono 600, and a slightly rough feel via `mix-blend-multiply` and opacity .9.
    - Variants: SELESAI (--ok), DIPERTIKAI (--dispute), DIABAIKAN (--ink-2), TERBUKA (--brand); texts from i18n status keys, uppercased.
    - Use it in the flag-detail header and on evidence.tsx, replacing the big status Badge there.
    - On the transition to settled: one motion "thunk" (initial scale 1.15, opacity 0 → scale 1, opacity 1, 160 ms) and buzz(12).
D5. Handwriting accent, used once: on count.tsx, when a line's received value differs from the invoice qty, show that number in Kalam (font-family 'Kalam'), colour --brand, 28px, like the owner writing on the bon.
    - Replace the amber ring on changed lines with a 3px --short left bar plus the existing "−N" badge.
    - Kalam is used nowhere else.
D6. Motion budget: only these may move.
    (a) boxes drawing on /read;
    (b) NumberFlow when money changes;
    (c) sheets opening;
    (d) the stamp thunk;
    (e) the scan beam.
    Changes:
    - client/src/components/scan-beam.tsx: a single top→bottom sweep (repeat Infinity, repeatType 'loop', ease 'linear', 1.4 s), not a bounce.
    - Remove the list stagger (listItem() usages) and whileTap scale on cards/rows. Buttons keep an active:opacity-80 instead.
    - Remove the infinite pulses: the evidence highlight (evidence.tsx and photo-viewer.tsx rects) and line-crop.tsx become STATIC: fill var(--brand) with fillOpacity 0.16, plus a 2px var(--brand) stroke.
    - Delete .hl-pulse usage. Remove hover glows.
D7. Copy (ms.ts + en.ts): sentence case everywhere, no exclamation marks, short labels.
    - scan.snap "Ambil gambar" / "Take photo"
    - ev.baseline "Harga rujukan" / "Reference price"
    Do not change keys or core message templates.
D8. Home hero (home.tsx ~70-85):
    - a flat bg-ink card, no gradient, no border, radius 14, padding 20;
    - label "30 hari lepas" as text-[11px] uppercase tracking-[.12em] opacity-70;
    - the flagged amount in .num at 40px/44px weight 700;
    - below it, a hairline (border-t border-white/15) and two ledger columns, Selesai | Masih terbuka, in .num 20px with a vertical hairline between them.
    - Keep NumberFlow and the /flags link.

P2. LAYOUT FIXES (demo-visible at 360–390px)
U1. client/src/pages/flag-detail.tsx:172-182 sticky action bar: for open/disputed use `grid grid-cols-2 gap-2`. The send/remind/resend button is `col-span-2` primary at the default size; Pertikai/Buka semula and Selesaikan are secondary at the default size. Change main `pb-36` (line 93) to `pb-48`.
    Check at 360px: every label fits inside its button.
U2. client/src/main.tsx:40 Toaster: sonner's own CSS beats Tailwind classes. Use style={{ '--normal-bg': 'var(--ink)', '--normal-text': '#fff', '--normal-border': 'transparent', '--border-radius': '14px' } as React.CSSProperties} and toastOptions={{ style: { fontFamily: 'inherit', fontSize: 14 } }}, and remove the classNames.
U3. count.tsx result rows: replace the Link with a button whose onClick does `nav('/flags', { replace: true }); nav('/flags/' + f.id);` so Back from a flag returns to /flags, not to the count screen.
U4. client/src/pages/flags.tsx:28 tabs: each trigger stacks the count above the label: `className="min-h-14 flex-col gap-0 px-1 py-1.5 text-[11px] leading-[13px]"`, with children <span className="num text-base font-semibold leading-5">{n(k)}</span><span>{label(k)}</span>. All 4 tabs must be equal height at 360px.
U5. supplier-detail.tsx sub-figures: give each label `min-h-8 text-xs leading-4 text-ink-2` so the three amounts share a baseline. Invoice numbers in the list become Links to /invoices/:id.
U6. count.tsx photo tiles: `whitespace-normal px-3 text-center leading-5` on the tile buttons. After an upload, show a 40px rounded thumbnail of the photo (from the document file URL) instead of just a check.
U7. Dates in the UI language: flag-detail.tsx timeline (~141) and activity.tsx (~18, 31) use `lang === 'ms' ? 'ms-MY' : 'en-GB'` from useI18n().
U8. "Abaikan aduan" (flag-detail.tsx:175) opens a confirm Sheet first ("Abaikan aduan ini?" + destructive confirm + Batal), reusing the settings.tsx reset-sheet pattern.
    client/src/components/ui/sheet.tsx: add `max-h-[92dvh] overflow-y-auto` to the content, and replace `data-[state=open]:duration-300` with `data-[state=open]:duration-[420ms] data-[state=open]:ease-[cubic-bezier(0.22,1.25,0.36,1)]`.

P3. REMAINING (only while green; skip freely)
U9. ErrorState: add ErrorState({ onRetry, notFound }) to client/src/components/page.tsx (an AlertTriangle icon + t(notFound ? 'flag.notFound' : 'common.error') + a retry Button).
    - Render it when `q.isError` before the `!d ? skeleton` branch in home, flag-detail, supplier-detail, invoice-detail, count, flags, suppliers, orders and activity.
    - einvoice.tsx: when data.draft is null, show an EmptyState linking back to /invoices/:id instead of an endless skeleton.
U10. Back button (ghost, ArrowLeft + common.back, history.back() with fallback nav('/')) at the top-left of read, review, count and bon.
    - Empty-state CTAs (Link to /scan) on suppliers, orders and bon.
    - An OfflineBanner in AppShell (navigator.onLine + events; fixed top, bg-dispute, white text, t('common.offline')).
U11. Tokens and alt text:
    - button.tsx hover colours → new tokens --brand-hover/--surface-2-hover/--notord-hover (no raw hex in TSX);
    - message-sheet.tsx bg-white → bg-surface;
    - alt texts on line-crop, photo-viewer, scan preview, flag-detail photos and invoice-detail images;
    - read.tsx failure paragraph uses t('review.manualNote') (not the same text as the button).
U12. review.tsx: the document image sticky at the top (`sticky top-0 z-10 bg-bg/95 backdrop-blur py-2`, maxHeight 28dvh). Tapping a box scrolls row `row-{i}` into view (smooth, center); rows get `scroll-mt-[32dvh]`.

FINISH
1. Run `npm test`, `npm run typecheck` and `npm run build`; all must pass.
2. Settings → Set semula demo. Then one App Testing pass at 390px (OWNER_PIN=1234 STAFF_PIN=5678 on the workflow), repeating round 1's steps a–h:
   - scan the INV-2291 fixture → boxes;
   - count Maggi 8 + the bon fixture → RM110.00;
   - Maggi Lulus; Gula Laporkan harga 2.80;
   - send (edited) → no reminder logged;
   - evidence page logged out;
   - settle Maggi with Nota kredit → supplier page, Pay now RM962.00 → RM872.00, SELESAI stamp;
   - staff view has no owner buttons.
3. Also check the flag detail action bar and the flags tabs at 360px.
4. Save screenshots at 390px to docs/screens/round2/:
   01-home.png, 02-scan.png, 03-read.png, 04-review.png, 05-count-result.png, 06-flags.png, 07-flag-detail.png, 08-message.png, 09-evidence.png, 10-supplier.png.
   Commit them.
5. Reset the demo data again. Update docs/PROGRESS.md honestly (add a "Fix round 2" section).
6. FINAL message in exactly this format:
   DONE: <ids>
   SKIPPED: <ids with one-line reasons, or none>
   TESTS: <passed>/<total> · TYPECHECK: ok/fail · BUILD: ok/fail
   APP TEST: a ok/fail · … · h ok/fail · 360px bar ok/fail · 360px tabs ok/fail
   SCREENSHOTS: <count> saved
   NOT VERIFIED: <list>
```

## If the Agent stops early
```text
Continue FIX ROUND 2 from the first item not yet done (check docs/DECISIONS_LOG.md and the code). Same anti-loop rules R1–R5. End with the FINISH report format.
```
