# Tepat Bill: Product Requirements (PRD v1.0, final)

> Sources: `SPEC_TepatBuild.md` (scope), the 11-slide pitch deck (claims judges hear), `TECH_STACK.md` (stack). Every open question is resolved here (section 15). **If something isn't covered, choose the simplest option consistent with this PRD and log it in `docs/DECISIONS_LOG.md`. Don't stop to ask.**

---

## 0. Goal and what "winning" looks like

**Product:** *Tepat Bill: Check every delivery. Check every bill.* It catches wrong deliveries and wrong invoices before a small shop pays for them.

**Pitch line:** "The owner counts once and Tepat Bill does the rest."

**What judges must see in one 90-second run (story 35):**
1. Order → invoice photo → counts → RM flag with the exact invoice line highlighted.
2. Owner approves → WhatsApp opens with a factual message.
3. The supplier's phone opens the evidence page.
4. Mark settled → "Pay now" drops on screen.

**Quality bar:** it must feel like a polished fintech app (Wise, Revolut, Linear level), not a hackathon form. See section 6.

**Success criteria:**
- The demo journey works end to end on a phone in under 90 s.
- `npm test` is green.
- Every RM figure comes from `shared/core`.
- No screen looks like default shadcn.
- A Gemini outage cannot break the demo: cache, fixtures and manual entry cover it.

---

## 1. Users and roles

| Role | Who | How they sign in | Can |
|---|---|---|---|
| **Owner** | Shop owner (e.g. En. Rahman) | 4-digit PIN (`OWNER_PIN`) | Everything |
| **Staff** | Shop helper | 4-digit PIN (`STAFF_PIN`) | View · upload documents · correct AI reads · record received counts. **Can't** approve, dismiss, send, dispute, settle, mark correct, set prices, mark paid, edit suppliers, export, or touch e-invoices. |
| **Supplier** | The person at the supplier who gets the WhatsApp message | No login: unguessable link `/e/:token` | Read one flag's evidence page only |

- Permissions are enforced server-side with `can(role, action)` (`shared/core/roles.ts`).
- In the UI, owner-only actions are hidden for staff and replaced with a quiet note: "Menunggu kelulusan pemilik" (Waiting for owner approval).
- Switch user: Settings → "Tukar pengguna" logs out to the PIN screen.

## 2. Scope

**In:**
- Read orders, invoices and delivery orders (photo, screenshot or PDF page 1).
- Owner correction of anything the AI read.
- PO numbering and invoice → PO suggestion.
- Received counts.
- 3 flag rules: short quantity, price change, not ordered (with substitution guard).
- Owner approval → message → WhatsApp → evidence page.
- Flag lifecycle and settlement; payment tracking (on credit / paid) with credits.
- Supplier page with expected statement balance and policy note.
- Home monthly summary, 14-day follow-up reminders, activity log.
- Self-billed e-invoice **preview stub**.
- "Checks left" chip; CSV export.
- BM/EN.

**Out (roadmap slide only):**
- Damaged or expired goods flags.
- Counting stock from photos.
- Auto-sending anything; payments; LHDN submission; accounting integrations beyond the CSV.
- Sign-up, password reset, multi-shop.
- Order book with negotiated price lists beyond "agreed price".
- Any "% time saved" claim.

## 3. Domain glossary (use these words in the UI)

| BM (default) | EN | Meaning |
|---|---|---|
| Pesanan (PO) | Order (PO) | The owner's own order: notebook page, WhatsApp message or typed. Gets `PO-YYMM-###`. |
| Invois | Invoice | Supplier's bill (photo, screenshot or PDF). |
| Bon / DO | Delivery order | Delivery slip. The **signed bon** is photographed as evidence, after the owner writes "8 terima" on it. |
| Kiraan diterima | Received count | What staff counted and typed. |
| Aduan / Tanda | Flag | A difference found by the rules. |
| Pembekal | Supplier | |
| Hutang / Perlu bayar | Amount owed / Pay now | |
| Kredit pembekal | Supplier credit | Money the supplier owes back, applied to the next invoice. |
| Bukti | Evidence | The public evidence page. |

## 4. Epics, stories and acceptance criteria

Story numbers match the spec (1–35). **D-** stories come from the deck.

### E1 Orders (stories 1–3)
- **1–2.** *Given* the owner uploads a notebook page, WhatsApp screenshot or typed order, *when* the AI read finishes, *then* an editable item list appears with lines highlighted on the image. On save it gets the next `PO-YYMM-###` (`poNumber()`); the sequence is per month in the DB.
- **3.** Every field (supplier, item, qty, unit, price) is editable inline. Lines can be added or removed. Nothing is saved until "Simpan pesanan" (Save order).
- `sku` = slug of the description at PO creation, e.g. `maggi-kari`. It is the key for counts and the price list.
- Supplier picker: fuzzy-match the AI's supplier name to existing suppliers (`tokenOverlap ≥ 0.6`), else offer "Pembekal baru" (New supplier) prefilled.

### E2 Invoices (stories 4–7)
- **4.** One upload control: "Snap" (camera) or "Fail" (file: image or PDF). PDFs are rasterised client-side; page 1 only, with the notice "Hanya halaman 1 dibaca" (Only page 1 is read).
- **5.** The AI reads lines, quantities, prices, invoice number, date, currency and supplier country. Each line has a box on the image.
- **6–7.** The PO suggestion is the top result of `rankPoCandidates()`, shown as a chip "Padan dengan PO-2610-004" with a dropdown of other POs from that supplier (last 60 days) plus "Tiada PO".
- **D-foreign.** If `looksForeign(currency, supplierCountry)`, show the banner "Pembekal luar negara?" (Foreign supplier?). The owner confirms, which sets `supplier.isForeign`.
- **Invoice `issuedAt`** = the time it was recorded in the app, not the printed date (used for "next invoice" credit ordering). The printed date is stored as `docDate`.
- Foreign invoices: store the original currency, total and per-line `unit_price_foreign_minor`, and ask for the exchange rate (default 4.20 for USD). The ledger uses MYR sen; the e-invoice preview uses the foreign amounts, formatted with the currency code (not `formatRM`).

### E3 Delivery evidence and counts (stories 8–10)
- **8–9.** On the count screen, staff can attach a **delivery photo** and a **signed bon photo** (two labelled tiles). Neither is read for counts.
- **10.** Each invoice line shows a big number stepper (−/+ and tap-to-type) prefilled with the **invoice qty**. Staff change only what differs. Counts are saved per invoice line as key `line:<lineId>` (and per sku `<sku>` for PO-only lines). "Simpan kiraan" (Save counts) runs `detectFlags()` server-side and creates **Proposed** flags (replacing earlier Proposed flags for that invoice).
- Lines the PO expected but the invoice didn't bill: show them greyed with qty 0, so a substitution can be detected.

### E4 Flags (stories 11–16, D-wrong-item)
- **11–12.** `short_qty`: shows missing qty and RM (`formatRM`). Request choice: **"Hantar barang yang kurang"** (Send the missing items) or **"Tolak jumlah"** (Deduct the amount); default Deduct.
- **13.** `price_change` (up): shows "RM3.20 vs RM2.80 (invois lepas)", the impact on received qty, and the baseline source chip: *Harga dipersetujui* (agreed), *Harga PO* (PO price) or *Invois lepas* (last invoice).
  - Decreases show as an info card with RM0 and no actions except Dismiss.
- **14.** "Ini kenaikan biasa" (This is a normal increase) dismisses it and updates the price list via `autofillPriceList` without skip.
- **15.** "Laporkan harga" (Report price): the owner types the agreed price. This calls `setAgreedPrice`, then approves with request `agreed_price`, and the message states the agreed price.
- **D-wrong-item.** `not_ordered`: request "Ambil semula, tidak dicaj" (Collect back, remove from invoice).
  - If `possibleSubstituteFor` is set, show one **"Diganti?"** (Substituted?) card: "Roti kaya dipesan, Roti mentega jagung dihantar" (kaya was ordered, mentega jagung was delivered).
  - Actions: **Pautkan** (Link): learn an alias for that supplier and re-run detection, so it becomes at most a price-change flag. **Asingkan** (Keep separate): keep the not_ordered flag.
- **18.** Only **Owner** can approve (`proposed → open`). Approve requires choosing a request.
- **32.** The supplier's policy note shows as a muted card on the flag screen if set.
- **34.** Every flag shows its PO number and invoice number, both tappable.

### E5 Message and evidence (stories 17, 19–22)
- **17.** The message is built only by `draftMessage()` (BM or EN, toggle on the preview). It groups all Open flags of the same invoice that haven't been sent yet. The preview is an editable textarea, prefilled; the owner may edit the text.
- **19.** "Buka WhatsApp" (Open WhatsApp) = `waLink(text, supplier.whatsapp)`, plus a "Salin mesej" (Copy message) button. Tapping it calls `POST /flags/:id/sent` (`markSent`, sets `sentAt`) for each flag in the message.
- **20–22.** The message includes `PUBLIC_BASE_URL/e/<token>`.
  - Evidence page shows `buildEvidence()` only: shop name, supplier name, PO and invoice numbers, the flagged line, the invoice image with the highlighted box, the signed bon and delivery photos, the baseline for price flags, and status.
  - It has no login and no amounts owed. For grouped messages, the link is the first flag's token; the evidence page lists the sibling flags from the same invoice that were sent together.

### E6 Lifecycle and money (stories 23–31, 33, D-correct)
- **23–25.** Status chips: Perlu semakan (Proposed) · Terbuka (Open) · Dipertikai (Disputed) · Selesai (Settled) · Diabaikan (Dismissed).
  - Settle sheet offers **Dihantar semula** (Redelivered; short qty only) · **Nota kredit** (Credit note) · **Ditolak daripada invois** (Deducted).
  - Dispute keeps all photos and lets the owner add a note.
  - Use `transition()` only.
- **26.** Follow-up reminder: `needsReminder()` on Open/Disputed flags 14+ days after sending. It shows on Home "Perlu susulan" (Needs follow-up) and on the flag, with a "Hantar peringatan" (Send reminder) button that reopens the WhatsApp message.
- **27–28.** Each invoice is `on_credit` by default with `dueAt = defaultDueAt(issuedAt)`, editable. "Tandakan sudah dibayar" (Mark paid) sets `paidAt`.
- **29–31, D-credit.**
  - Supplier page money comes only from `supplierLedger()`: **Perlu bayar** (Pay now: `payNowSen`), **Dipertikai** (Under dispute: `disputedSen`), **Kredit pembekal** (Supplier credit: `creditCarrySen`, shown as "Pembekal berhutang RM X dengan anda"), and **Baki penyata dijangka** (Expected statement balance: `owedSen`).
  - Per-invoice rows show credit applied.
- **33.** Home summary uses `last30Days()`: RM flagged, settled and still open in the **last 30 days** (label "30 hari lepas"; robust on any demo date), with animated digits. `monthSummary()` exists for a month filter.
- **D-correct.** Invoice state uses `orderState()`. "Sahkan tepat" (Mark correct) is owner-only and enabled only when `canMarkCorrect()`.

### E7 Deck extras
- **D-log.** Activity log of every write (who, role, action, ref, time), at `/activity`. Grouped by day.
- **D-einvoice.** For foreign suppliers' invoices: "Sediakan e-invois bil kendiri" (Prepare self-billed e-invoice).
  - Shows a preview with `prepareSelfBilled()` fields and a red ribbon **"Pratonton, tidak dihantar ke LHDN"** (Preview, not submitted to LHDN).
  - Owner Approve, then Release (`releaseDraft`). Release only logs an event.
- **D-checks.** "Baki semakan: N" (Checks left: N) chip in the header. Starts at 50 and decrements on each **non-cached** AI read. It is illustrative only, with no billing.
- **D-export.** Owner can export approved flags and invoices as CSV ("Eksport untuk akauntan", Export for accountant).

## 5. Screens (mobile-first 390 × 844; also fine at 360 and desktop with a centred 480px column)

Navigation:
- **Bottom tab bar:** Utama (Home) · Aduan (Flags, with a badge = Proposed + reminders) · **centre Scan button** · Pembekal (Suppliers) · Lagi (More: Orders, Activity, Settings).
- Owner and staff see the same nav. Staff see no owner-only buttons.

| Route | Purpose | Key components and states |
|---|---|---|
| `/login` | PIN entry | Brand mark, "Tepat Bill" wordmark, 4 PIN dots, a numeric keypad with large keys (no system keyboard), shake animation plus haptic on a wrong PIN, Owner/Staff detected from the PIN. |
| `/` Home | Money at a glance + what needs action | Hero card "30 hari lepas" (Last 30 days) with 3 NumberFlow figures. "Perlu tindakan" (Needs action) list: proposed flags (owner), reminders. Supplier credit chips. Recent activity (5). Checks chip. **Staff home:** a big "Rekod penghantaran" (Record delivery) CTA and today's deliveries. Empty state: illustration plus "Imbas invois pertama anda" (Scan your first invoice). |
| `/scan` | Capture | Sheet: "Apa yang anda imbas?" (What are you scanning?): Pesanan / Invois / Bon. Then camera or file. Client-side downscale or PDF raster with a thumbnail preview. Upload with a progress ring. |
| `/read/:documentId` | **The reading moment** (hero UX) | Full-width image with a scanning-beam animation while Gemini works. Rotating status text ("Membaca baris…", "Menyemak harga…"). Then each box draws in with a stagger while its row slides into the list. If >12 s: "Masih membaca…"; if `DEMO_FIXTURES`: a "Guna bacaan demo" link. On failure: "Tak dapat baca, isi sendiri" (Couldn't read, fill it in yourself), going to manual entry. |
| `/review/po/:documentId` | Correct the PO read | Editable rows (tap a row to highlight its box on the image, and the reverse). Supplier picker. Save → PO number toast. |
| `/review/invoice/:documentId` | Correct the invoice read | As above, plus invoice no., date, currency, PO suggestion chip, foreign banner, and totals check (lines sum vs printed total: warn if different). |
| `/invoices/:id/count` | Received counts | Line cards with big steppers (prefilled with invoice qty; changed lines glow amber), evidence photo tiles (delivery, signed bon), and a sticky "Simpan kiraan" button. Then an animated result: "2 perbezaan ditemui · RM110.00" (2 differences found) or a green "Semua tepat ✓" (All correct). |
| `/flags` | All flags | Segmented tabs: Perlu semakan · Terbuka · Dipertikai · Selesai. Cards show the type icon/colour, item, RM, supplier, age and reminder dot. Pull-to-refresh is not needed. |
| `/flags/:id` | Flag detail | Header: RM amount (big) plus type chip. The invoice image cropped and zoomed to the **highlighted line** (pinch-zoom on tap). Facts table (billed / received / missing or price vs baseline with source). PO ↔ invoice links. Policy note. Request selector. Owner actions in a sticky bottom bar: Lulus (Approve) / Abaikan (Dismiss), or later Hantar (Send) / Pertikai (Dispute) / Selesaikan (Settle). Timeline of events for this flag. |
| `/flags/:id/message` | Message preview | Phone-style chat bubble preview, BM/EN toggle, editable text, "Buka WhatsApp" (primary, WhatsApp green), "Salin mesej". |
| `/suppliers` | Suppliers list | Each shows Pay now, Under dispute and credit, plus a next-due date. |
| `/suppliers/:id` | Supplier page | Money header (Pay now / Dipertikai / Kredit / Expected statement balance). Invoices list with payment status and due dates. Flags. Policy note (editable, owner). WhatsApp number. Foreign toggle. |
| `/orders` | POs and invoices | Two tabs. Invoice row shows state (recorded / has flags / correct) and payment. |
| `/invoices/:id` | Invoice detail | Image with all boxes, lines, counts, flags, payment controls, Mark correct, e-invoice button (if foreign). |
| `/invoices/:id/einvoice` | Self-billed e-invoice preview | Document-style card with all fields, the red "Pratonton" ribbon, Approve and Release buttons. |
| `/activity` | Activity log | Day-grouped timeline with role avatars. |
| `/settings` | Settings | Language, switch user, checks left, export CSV, "Reset demo" (owner, dev only), about. |
| `/e/:token` | **Public evidence page** | Branded "Bukti · Tepat Bill", the shop and supplier names, "Aduan: Kurang 2 unit · RM90.00". Invoice image with the **pulsing highlighted line**. Signed bon and delivery photos (tap to zoom). PO lines vs invoice line comparison. Status badge. BM/EN toggle. Footer "Halaman baca sahaja" (Read-only page). No nav, no app chrome. |

## 6. Design system and UX: the premium bar

**Feel:** calm, confident, money-first, like a fintech app. Generous whitespace, one accent colour, big numbers, soft depth, fast springy motion. **Every screen must pass the polish checklist (6.8).**

### 6.1 Tokens (CSS variables in `client/src/index.css`, wired into Tailwind 4 `@theme`)
| Token | Light | Use |
|---|---|---|
| `--bg` | `#F5F7FB` | App canvas |
| `--surface` | `#FFFFFF` | Cards |
| `--surface-2` | `#EEF3FB` | Insets, chips (deck light blue) |
| `--ink` | `#13254A` | Primary text, money (deck navy) |
| `--ink-2` | `#55617A` | Secondary text |
| `--line` | `#E3E8F2` | Hairlines |
| `--brand` | `#2457D6` | Primary actions, focus (deck blue) |
| `--brand-ink` | `#FFFFFF` | Text on brand |
| `--short` / `--short-bg` | `#B45309` / `#FEF3C7` | Short quantity |
| `--price` / `--price-bg` | `#6D28D9` / `#EDE9FE` | Price change |
| `--notord` / `--notord-bg` | `#BE123C` / `#FFE4E6` | Not ordered |
| `--ok` / `--ok-bg` | `#047857` / `#D1FAE5` | Settled, all correct |
| `--dispute` / `--dispute-bg` | `#C2410C` / `#FFEDD5` | Disputed |
| `--wa` | `#25D366` | WhatsApp button only |

- Dark theme: define the same tokens under `.dark` (navy canvas `#0B1530`, surface `#121F42`). Optional; on the cut list.
- Radius: cards 20px, buttons 14px, chips 999px, sheets 28px top. Spacing on a 4px grid; screen padding 20px.
- Shadows: `0 1px 2px rgba(19,37,74,.06), 0 8px 24px rgba(19,37,74,.06)` (cards); elevated sheets get a stronger second layer.

### 6.2 Type
- **DM Sans** (Google Fonts, weights 400/500/600/700) for everything.
- **Money and all numbers:** `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`).
- Scale: Display 40/44 bold (hero RM) · Title 28/34 semibold · Heading 20/26 semibold · Body 16/24 · Label 14/20 medium · Caption 12/16.
- RM amounts: "RM" smaller and lighter than the digits (e.g. `RM` at 60% size, `--ink-2`).

### 6.3 Components (shadcn/ui, restyled with the tokens; never default grey)
- **Buttons:** primary (brand, 52px tall on mobile, full width in sticky bars), secondary (surface-2), ghost, destructive (only in confirm sheets). Press = scale .97 spring.
- **Sticky action bar:** bottom, blurred backdrop (`backdrop-blur`), safe-area padding (`env(safe-area-inset-bottom)`).
- **Sheets:** shadcn `Sheet` with `side="bottom"`, for all secondary choices (request type, settle kind, scan type, confirmations). No centred modal dialogs on mobile.
- **Toasts:** `sonner`, bottom-centre above the nav, short BM text, with an undo where reversible.
- **Icons:** `lucide-react` 1.5px stroke. Flag type icons: PackageMinus (short) · Tag (price) · PackageX (not ordered) · Repeat (substituted).
- **Chips:** pill status chips with the semantic bg/fg colours.
- **Steppers:** 56px circular −/+ with the number centred at 28px. Long-press repeats.
- **Images:** `react-zoom-pan-pinch` in a full-screen viewer, with the box overlay as an absolutely-positioned SVG using `box_2d` / 10 as % coordinates. Highlighted line: `--brand` 2px stroke plus a 15% fill and a soft pulse.
- **Empty states:** a simple inline SVG line illustration (receipt / box) plus one sentence plus one CTA.
- **Skeletons:** shimmer placeholders that match the final layout. Never a lone spinner over 300 ms.

### 6.4 Motion (`motion/react`)
- **Springs:** `{ type: 'spring', stiffness: 420, damping: 32 }` for UI; `{ stiffness: 260, damping: 26 }` for sheets.
- **Lists:** stagger children by 40 ms (y: 8 → 0, opacity 0 → 1).
- **Shared layout:** the flag card → flag detail amount and chip use `layoutId`.
- **Money:** `@number-flow/react` for every changing RM figure, e.g. Home hero and supplier Pay now (it rolls down when a flag is settled: **this is the demo's money shot**).
- **Reading moment:** a scan beam (a gradient bar sweeping top→bottom, 1.6 s loop) over the image. On result, boxes draw (stroke-dashoffset) one by one at 120 ms stagger, synced with rows sliding in.
- **Success:** a check icon morph plus a subtle scale pop on "Semua tepat" and on Settle. `navigator.vibrate?.(12)` on approve, settle and wrong PIN.
- Respect `prefers-reduced-motion` (fade only).

### 6.5 Copy and tone
- BM first, short, warm, factual. Numbers always as `formatRM`. Dates `DD/MM/YYYY`. Relative ages ("3 hari lalu", 3 days ago).
- Never accusatory: "Kurang 2 unit" (2 units short), not "Pembekal menipu" (supplier cheated).

### 6.6 Key strings (`client/src/i18n/ms.ts` / `en.ts`)
| key | ms | en |
|---|---|---|
| app.tagline | Semak setiap penghantaran. Semak setiap bil. | Check every delivery. Check every bill. |
| home.thisMonth | 30 hari lepas | Last 30 days |
| home.flagged / settled / open | Ditanda / Selesai / Masih terbuka | Flagged / Settled / Still open |
| home.needsAction | Perlu tindakan | Needs action |
| home.followUp | Perlu susulan | Needs follow-up |
| scan.what | Apa yang anda imbas? | What are you scanning? |
| scan.po / invoice / bon | Pesanan / Invois / Bon | Order / Invoice / Delivery order |
| read.reading | Membaca dokumen… | Reading document… |
| read.manual | Tak dapat baca. Isi sendiri | Couldn't read it. Fill in yourself |
| count.save | Simpan kiraan | Save counts |
| count.allGood | Semua tepat | All correct |
| count.diffs | {n} perbezaan ditemui | {n} differences found |
| flag.short | Kurang {n} unit | {n} units short |
| flag.price | Harga naik | Price increased |
| flag.notOrdered | Tidak dipesan | Not ordered |
| flag.substituted | Diganti? | Substituted? |
| flag.approve / dismiss | Lulus / Abaikan | Approve / Dismiss |
| flag.req.send / deduct / collect / agreed | Hantar barang yang kurang / Tolak jumlah / Ambil semula, tidak dicaj / Caj ikut harga yang dipersetujui | Send missing items / Deduct amount / Collect back, don't charge / Charge agreed price |
| flag.openWa / copy | Buka WhatsApp / Salin mesej | Open WhatsApp / Copy message |
| flag.dispute / settle | Pertikai / Selesaikan | Dispute / Settle |
| settle.redelivered / credit / deducted | Dihantar semula / Nota kredit / Ditolak daripada invois | Redelivered / Credit note / Deducted |
| status.* | Perlu semakan · Terbuka · Dipertikai · Selesai · Diabaikan | Needs review · Open · Disputed · Settled · Dismissed |
| supplier.payNow / disputed / credit / statement | Perlu bayar / Dipertikai / Pembekal berhutang {rm} kepada anda / Baki penyata dijangka | Pay now / Under dispute / Supplier owes you {rm} / Expected statement balance |
| owner.only | Menunggu kelulusan pemilik | Waiting for owner approval |
| evidence.title | Bukti aduan | Complaint evidence |
| evidence.readOnly | Halaman baca sahaja · Tepat Bill | Read-only page · Tepat Bill |
| einv.preview | Pratonton, tidak dihantar ke LHDN | Preview, not submitted to LHDN |
| checks.left | Baki semakan: {n} | Checks left: {n} |

### 6.7 Accessibility
Tap targets ≥ 44px · contrast AA on all tokens · visible focus ring (`--brand` 2px offset 2px) · images have alt text (e.g. "Invois INV-2291") · all colours paired with icon or text (not colour-only).

### 6.8 Polish checklist (every screen must pass before its milestone is done)
1. Uses tokens only. No raw Tailwind greys or blues, no default shadcn look.
2. Mobile 390px: no horizontal scroll; primary action reachable by thumb (sticky bottom bar).
3. Loading state uses layout-matched skeletons; no layout shift when data arrives.
4. Every RM uses `formatRM` + `tabular-nums`; changing totals animate with NumberFlow.
5. Empty, error and offline states designed (an illustration or icon plus one CTA).
6. Lists stagger in; sheets spring; buttons press-scale; reduced motion respected.
7. All text from i18n; BM default; no truncation of BM strings at 360px.
8. Owner-only actions are invisible to staff, and the server returns 403.
9. Lighthouse mobile: Performance ≥ 85, Accessibility ≥ 95 (check once at M10).

## 7. Data model (`shared/schema.ts`, Drizzle, PostgreSQL)

Money = `integer` sen. Quantities = `integer`. Times = `timestamp with time zone`; convert to ms epoch (`getTime()`) before calling `shared/core`. IDs = `text` primary keys (`nanoid`/`cuid`) or `uuid`.

| Table | Columns |
|---|---|
| `suppliers` | id, name, whatsapp (nullable), is_foreign bool, country (nullable), policy_note (nullable), created_at |
| `documents` | id, kind enum(`po`,`invoice`,`delivery_note`,`photo`), photo_kind enum(`invoice`,`po`,`signed_bon`,`delivery`) nullable, storage_key, mime, sha256, width, height, page_count, uploaded_by_role, created_at |
| `extractions` | sha256 PK, model (`gemini-3.8-flash` / `gemini-3.5-flash-lite` / `fixture` / `manual`), doc jsonb (ExtractedDoc), created_at. **The read cache.** |
| `purchase_orders` | id, po_no unique, supplier_id, document_id nullable, source enum(`notebook`,`whatsapp`,`typed`), ordered_at, created_at |
| `po_lines` | id, po_id, sku, description, ordered_qty, unit nullable, unit_price_sen nullable, box jsonb nullable, position |
| `invoices` | id, invoice_no, supplier_id, po_id nullable, document_id nullable, doc_date nullable, currency default 'MYR', exchange_rate numeric nullable, total_foreign_minor nullable, total_sen, issued_at (recorded time), payment enum(`on_credit`,`paid`), paid_at nullable, due_at, owner_marked_correct bool, extraction_model nullable, created_at |
| `invoice_lines` | id, invoice_id, line_id (`L1`…), sku nullable (matched PO sku), description, qty, unit nullable, unit_price_sen (MYR sen), unit_price_foreign_minor nullable (original currency, foreign invoices only), line_total_sen nullable, box jsonb nullable, position |
| `received_counts` | invoice_id, key (`line:<lineId>` or PO sku), qty, recorded_by_role, recorded_at; PK(invoice_id, key) |
| `price_list` | supplier_id, sku, last_invoice_sen nullable, agreed_sen nullable; PK(supplier_id, sku) |
| `aliases` | supplier_id, normalised_desc, sku; PK(supplier_id, normalised_desc) |
| `flags` | id, supplier_id, invoice_id, po_id nullable, invoice_line_id, sku nullable, type, amount_sen, status, settlement nullable, request nullable, missing_qty, invoice_unit_sen, baseline_unit_sen, baseline_source, priced_qty, direction, possible_substitute_for, note, evidence_token unique (32-hex, `crypto.randomBytes(16)`), opened_at, sent_at, settled_at, created_at |
| `flag_photos` | flag_id, document_id; PK(flag_id, document_id) |
| `einvoice_drafts` | id, invoice_id unique, status enum(`draft`,`approved`,`released_stub`), fields jsonb, created_at, updated_at |
| `events` | id, at, role, action, ref, meta jsonb |
| `settings` | key PK, value jsonb (`checks_left`, `shop`, `po_seq:YYMM`) |

**Mapping to core:** build `Flag`, `Invoice`, `PoLine`, `InvLine`, `PriceList` and `AliasTable` from rows in `server/core-adapters.ts`, then call core. Never re-derive money in SQL.

## 8. API contract (Express, JSON; cookie `tb_session` required unless marked public)

Errors: `{ error: { code, message } }` with 400 / 401 / 403 / 404 / 409 / 422. Every write inserts an `events` row.

| Method & path | Role | Body → Response |
|---|---|---|
| POST `/api/auth/login` | public | `{pin}` → `{role}`; sets an httpOnly cookie (HS256 JWT via `jose`, `SESSION_SECRET`, 30 days, sameSite=lax, secure in production). Wrong PIN → 401 (rate-limit 5/min/IP). |
| POST `/api/auth/logout` · GET `/api/auth/me` | any | → `{role}` |
| POST `/api/documents` | any | multipart `file`, `kind`, `photoKind?` → `{id, sha256, width, height}`. Stores the bytes in App Storage under `docs/<sha256>.<ext>`. |
| GET `/api/documents/:id/file` | any | streams the image (Cache-Control private) |
| POST `/api/documents/:id/extract` | any | → `{status:'ok', model, cached, doc}` or `{status:'manual', reason}`. Cache hit by sha256 → no Gemini call; checks_left decremented only on a real call. |
| POST `/api/documents/:id/use-fixture` | any (only if `DEMO_FIXTURES=1`) | `{fixture}` → `{status:'ok', model:'fixture', doc}` |
| GET `/api/fixtures` | any (only if `DEMO_FIXTURES=1`) | → list of fixture names |
| POST `/api/pos` | any | `{supplierId|newSupplier, documentId?, source, orderedAt?, lines[]}` → `{id, poNo}` |
| GET `/api/pos?supplierId=` · GET `/api/pos/:id` | any | |
| POST `/api/invoices` | any | `{supplierId|newSupplier, documentId?, poId?, invoiceNo, docDate?, currency, exchangeRate?, lines[], totalSen}` → `{id}`. Matches lines to PO skus (`matchLine`) and stores `sku`. |
| GET `/api/invoices/:id/po-suggestions` | any | → `rankPoCandidates()` output with poNo |
| PUT `/api/invoices/:id/counts` | any | `{counts:{['line:L1'\|sku]:qty}, photoDocIds?}` → `{flags:[...]}` (runs `detectFlags`, replaces this invoice's Proposed flags, attaches photos) |
| GET `/api/flags?status=&supplierId=` · GET `/api/flags/:id` | any | detail includes invoice lines, photos, PO, supplier policy, events |
| POST `/api/flags/:id/approve` | owner | `{request}` → flag (`transition` → open). 409 unless proposed. |
| POST `/api/flags/:id/dismiss` | owner | `{asInflation?:boolean}` → flag (if a price flag and asInflation, update price list) |
| POST `/api/flags/:id/report-price` | owner | `{agreedSen}` → flag. 409 unless the flag is proposed. Steps: `setAgreedPrice`, re-run `detectFlags` for that line, update amountSen, baselineUnitSen and baselineSource='agreed', then `transition` proposed→open with request `agreed_price`. Do **not** call approve first. |
| POST `/api/flags/:id/link-substitute` | owner | `{poSku}` → `{flags}` (learnAlias + re-detect) |
| GET `/api/flags/:id/message?lang=` | owner | → `{text, waUrl, flagIds}` (draftMessage over unsent Open flags of the same invoice) |
| POST `/api/flags/sent` | owner | `{flagIds}` → `markSent` each |
| POST `/api/flags/:id/dispute` · `/reopen` · `/settle` | owner | `{note?}` / – / `{settlement}` |
| PATCH `/api/invoices/:id/payment` | owner | `{payment, paidAt?, dueAt?}` |
| POST `/api/invoices/:id/mark-correct` | owner | 409 unless `canMarkCorrect` |
| GET `/api/suppliers` · GET `/api/suppliers/:id` · PATCH `/api/suppliers/:id` | any / any / owner | detail includes `supplierLedger()` output |
| GET `/api/home` | any | `{summary: last30Days, needsAction, reminders, credits, recent, checksLeft}` |
| GET `/api/events?limit=` | any | |
| POST `/api/invoices/:id/einvoice` · `/einvoice/approve` · `/einvoice/release` | owner | draft lifecycle via `shared/core/einvoice.ts` |
| GET `/api/export.csv` | owner | flags + invoices, sen formatted as RM |
| GET `/api/public/evidence/:token` | **public** | → `buildEvidence()` + `{shopName, supplierName, siblings, invoiceDocDate}` (page shows docDate, falling back to issuedAt); header `X-Robots-Tag: noindex`; 404 for proposed or dismissed |
| GET `/api/public/evidence/:token/photo/:documentId` | **public** | streams only if that document belongs to that flag |
| POST `/api/dev/reset` | owner, dev only | wipe + seed |

## 9. AI extraction contract (server only)

Use `shared/core/extract.ts` as is: `makeGemini(process.env.GEMINI_API_KEY)`, `extractWithFallback(primary, fallback, bytes, mediaType)`, `EXTRACTION_PROMPT`, `ExtractedDoc` (flat Zod schema), `geminiOptions` (thinking `low`, media resolution high), `cacheKey`, `linesToSen`.

Flow for `POST /documents/:id/extract`:
1. sha256 → `extractions` hit? Return cached (`cached:true`).
2. Else call `extractWithFallback`. On `ok`: store it, decrement `checks_left`, log `ai.read` with the model. On `needsManualEntry`: return `{status:'manual'}`.
3. Timeout 45 s server-side (AbortController) → manual.

Rules:
- Images only (PDF pages are rasterised client-side).
- Boxes are display-only: when the model was the fallback, or a line has no box, the UI highlights the row in the list instead.
- **Never** let AI output reach a calculation without passing `ExtractedDoc` and the owner's review screen.

## 10. Rules and money (all in `shared/core`, already tested)

| Function | Does |
|---|---|
| `detectFlags(input)` | short_qty / price_change / not_ordered (+ `possibleSubstituteFor`). Integers only. No double counting. |
| `baseline()` | agreed → PO price → last invoice → none (first invoice raises no flag) |
| `autofillPriceList` / `setAgreedPrice` / `learnAlias` | Price list and alias updates. After saving counts, autofill the price list from that invoice, **skipping skus with an unresolved price flag**. |
| `transition` / `markSent` | Lifecycle; redelivered only for short_qty; settled and dismissed are final |
| `supplierLedger` | owedSen, disputedSen, payNowSen, creditCarrySen, recoveredSen, rows |
| `needsReminder` | Open/Disputed ≥ 14 days since sent (or approval) |
| `orderState` / `canMarkCorrect` | recorded / has_flags / correct |
| `last30Days` / `rangeSummary` / `monthSummary` | Home hero numbers (Home uses `last30Days`) |
| `poNumber` / `rankPoCandidates` / `looksForeign` / `matchLine` | Documents |
| `draftMessage` / `waLink` / `toMsisdn` | Message (section 11) |
| `buildEvidence` | Evidence whitelist |
| `prepareSelfBilled` / `approveDraft` / `releaseDraft` | E-invoice stub |
| `can(role, action)` | Permissions |

## 11. Message and evidence specifics
- Message lines and wording come **only** from `draftMessage()` (exact BM/EN templates, tested). Example (BM):
  ```
  Salam Syarikat Borong Ali Sdn. Bhd., ini Kedai Runcit Maju.
  Untuk invois INV-2291 bertarikh 20/10/2026 (pesanan PO-2610-004):
  • MAGGI KARI 5'S (CTN 8 PEK): dibil 10, diterima 8. Kurang 2 unit = RM90.00.
  • GULA PASIR 1KG: harga invois RM3.20/unit, harga dipersetujui RM2.80/unit, untuk 50 unit = beza RM20.00.
  Jumlah: RM110.00.
  Mohon tolak jumlah ini daripada invois.
  Mohon caj mengikut harga dipersetujui.
  Bukti (gambar & dokumen): https://<host>/e/3f9c…
  Terima kasih.
  ```
- The evidence URL host comes from `PUBLIC_BASE_URL`, else the request origin. Production must use the deployed `.replit.app` URL.
- No supplier number → `wa.me/?text=` (WhatsApp contact picker). Seed suppliers deliberately have **no** numbers, so the demo never messages a stranger.

## 12. Demo data, fixtures and demo-safety
- `npm run seed` loads `fixtures/seed.json`. `daysAgo` fields are relative to now. Upload the `fixture` images in it to App Storage and pre-fill `extractions` with each fixture image's sha256 → its `*.expected.json` (model `fixture`).
- **Demo-safety ladder:**
  1. Live Gemini read (billed key on demo day).
  2. Cache hit (the same image read before).
  3. `DEMO_FIXTURES=1` "Guna bacaan demo" (Use demo read) link after 12 s or on failure. It lists fixtures and loads the chosen `*.expected.json`.
  4. Manual entry.
- **Substitution (Pautkan):** learn the alias, then re-run `detectFlags` with the same `line:<lineId>` counts. The count follows the invoice line, so linking yields no flag (same price) or only a price-change flag.
- **Seed `po_seq`:** set `po_seq:<YYMM of now>` to the highest seeded PO sequence for that month, so live POs never collide.
- **Before demo day:** read 5+ real photographed handwritten bons on the billed key (spec requirement) and note the results in `docs/DECISIONS_LOG.md`.
- `fixtures/docs`:

  | File | Use |
  |---|---|
  | `po_notebook_borong_ali.png` | Handwritten PO, seeded as PO-2610-004 |
  | `invoice_borong_ali_INV-2291.png` | **Live demo invoice** |
  | `bon_signed_DO-5512.png` | Signed bon: "8 terima sahaja" |
  | `delivery_photo_INV-2291.png` | Delivery evidence |
  | `po_whatsapp_kilang_roti_sinar.png` + `invoice_kilang_roti_sinar_0118.png` | Substitution demo |
  | `invoice_foreign_GZ-2026-088.png` | e-invoice demo, seeded |

- **Bon (DO) reads** are for evidence and cross-checking quantities only; counts are always typed.
- **Expected live result** (asserted in `shared/core/fixtures.test.ts`):
  - Staff types Maggi **8** (others unchanged) → **Maggi short RM90.00** + **Gula +RM0.40 × 50 = RM20.00** (baseline: last invoice RM2.80).
  - Borong Ali Pay now is **RM962.00** after upload (RM993.90 − RM31.90 supplier credit), then **RM872.00** after the RM90 deduction settles.
- Seed also gives:
  - Lim Brothers: one Open flag 15 days after sending (reminder) and one Disputed (Under dispute RM12.50).
  - Guangzhou: foreign, e-invoice preview available.

### Demo script (90 s, two phones + projector mirror of the owner phone)
1. Owner phone on Home. Hero shows this month's numbers; Lim Brothers is in "Perlu susulan".
2. Scan → Invois → photograph the printed INV-2291. **The reading moment**: lines and boxes draw in. The PO chip suggests PO-2610-004. Save.
3. Count screen (owner records it, so there's no user switch mid-demo): change Maggi 10 → **8**, attach the signed bon photo. "Simpan kiraan" → **"2 perbezaan ditemui · RM110.00"**.
4. Open the Maggi flag: the invoice crops to the highlighted Maggi line. Lulus → Tolak jumlah (Deduct). Gula flag: tap **Laporkan harga**, enter RM2.80 (this approves it; don't tap Lulus first).
5. Message → BM preview → **Buka WhatsApp** → WhatsApp's contact picker opens (seed suppliers have no number) → choose the judge's chat → send.
6. Judge taps the link → evidence page with the pulsing highlighted line and the signed bon.
7. Owner: Settle → Nota kredit. Supplier page **Pay now rolls RM962.00 → RM872.00**. Home "Selesai" ticks up.

## 13. Non-functional
- **Mobile-first.** Works on Android Chrome and iOS Safari. HTTPS (Replit gives it).
- **Uploads:**
  - Client downscale: `createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas, long edge 1600px → `toBlob('image/jpeg', 0.85)`.
  - PDF: `pdfjs-dist` page 1 at a scale where the long edge is 1600px.
  - Server limit 15 MB.
- **Privacy:** synthetic documents only on the free key. Show the footer note in Settings: "Demo menggunakan dokumen sintetik" (Demo uses synthetic documents). Evidence tokens are unguessable. No PII in logs.
- **Performance:** Home first paint under 1.5 s on 4G (on a warm Reserved VM); TanStack Query cache with optimistic updates for approve, settle and counts.
- **Reliability:** Gemini timeout 45 s; every failure has a next step (fallback → fixture → manual).

## 14. Deployment (Replit)
- **Dev:** Replit workspace, `npm run dev`. Secrets as listed in `replit.md`.
- **Demo day:** publish as a **Reserved VM** (no cold start); set the secrets in the deployment; run `npm run db:push && npm run seed` against the production DB once; set `PUBLIC_BASE_URL` to the `.replit.app` URL; set `DEMO_FIXTURES=1`.
- Keep GitHub in sync from the Replit Git pane (pull before push) so Claude Code can polish the same repo.

## 15. Decisions (final; do not reopen)
| Question | Decision |
|---|---|
| Name | **Tepat Bill** |
| Single user (spec) vs staff (deck) | Owner + Staff PINs |
| Wrong item | Built as `not_ordered`, with a substitution guard |
| Agreed price source | agreed → PO price → last invoice → none |
| Supplier's first invoice | No price flag; becomes the baseline |
| Dismiss price change | Updates the baseline (normal inflation) |
| Redelivered | Short qty only; owed unchanged |
| Credit on a paid invoice | Supplier credit → next unpaid invoice(s) recorded after it; remainder carries forward; owed never below RM0 |
| Disputed money | Stays owed; shown as "Under dispute" |
| Reminder | Open/Disputed, 14 days after WhatsApp sent (or approval) |
| "Invoice date" for credit ordering | The time it was recorded in the app |
| Foreign supplier | AI suggests (currency/country), owner confirms; e-invoice is a preview stub |
| Pay per use | "Checks left" chip, illustrative only |
| Orbyte | Pitched as "designed to plug into Orbyte" (roles, approvals, activity log, credit wallet shapes) |
| PDF | Page 1 only, rasterised client-side |
| Hosting | Replit (Reserved VM on demo day); Gemini via own key |
| Language | BM default, EN toggle; the message has its own BM/EN toggle |
