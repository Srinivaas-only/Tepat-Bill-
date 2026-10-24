<div align="center">

# Tepat Bill

**Check every delivery. Check every bill.**

A mobile-first web app that catches short deliveries, price changes and items that were never ordered, *before* a Malaysian kedai runcit pays for them.

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node-20-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-4169E1?logo=postgresql&logoColor=white)
![Gemini](https://img.shields.io/badge/AI-Gemini%20only-8E75B2)
![Tests](https://img.shields.io/badge/tests-248%20passing-2EA44F)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

SDC Hackathon 2026 · Domain 2 · Orbyte Smart SME Challenge · Team **Alt + Win + R**

**Live demo: https://tepat-bill.replit.app**

<br/>

<table>
  <tr>
    <td align="center" colspan="2" bgcolor="#2457D6"><br/><b>&nbsp;&nbsp;&nbsp;LOG IN WITH A DEMO PIN&nbsp;&nbsp;&nbsp;</b><br/><br/></td>
  </tr>
  <tr>
    <td align="center" bgcolor="#2457D6">
      <br/>
      <b>&nbsp;&nbsp;&nbsp;OWNER&nbsp;&nbsp;&nbsp;</b>
      <h1>&nbsp;&nbsp;🔑&nbsp;&nbsp;<code>1 2 3 4</code>&nbsp;&nbsp;</h1>
      <sub>Everything: approve, send, settle, export</sub>
      <br/><br/>
    </td>
    <td align="center" bgcolor="#2457D6">
      <br/>
      <b>&nbsp;&nbsp;&nbsp;STAFF&nbsp;&nbsp;&nbsp;</b>
      <h1>&nbsp;&nbsp;🔑&nbsp;&nbsp;<code>5 6 7 8</code>&nbsp;&nbsp;</h1>
      <sub>Scan, count and record deliveries</sub>
      <br/><br/>
    </td>
  </tr>
</table>

</div>

---

## The idea in one line

> **AI reads → rules decide → the owner approves.**

Gemini only *reads* the documents. Fixed, tested TypeScript rules calculate every ringgit. Nothing is sent, paid or settled without the owner's approval.

A shop receives goods, gets a signed delivery bon, and later an invoice. Shortages and wrong items are noticed at the door, then forgotten by the time the bill arrives. Tepat Bill keeps one record from delivery to invoice to supplier follow-up:

1. **Snap** the order, the delivery bon and the invoice (photo, screenshot or PDF page 1).
2. **Count** what actually arrived (staff type it; the AI never guesses counts).
3. **Compare** order ↔ bon ↔ invoice. Differences become flags in exact RM: *short quantity*, *price change*, *not ordered*.
4. **Approve** (owner only) and open a ready-made WhatsApp message with a read-only **evidence link**.
5. **Track** it until the supplier settles: credit note, deduction or redelivery. The ledger shows what is still owed.

<div align="center">
<table>
  <tr>
    <td><img src="docs/readme/1-home.jpg" width="190" alt="Home: money at a glance"/></td>
    <td><img src="docs/readme/4-scan.jpg" width="190" alt="Scan: what are you scanning"/></td>
    <td><img src="docs/readme/3-count.jpg" width="190" alt="Count what arrived"/></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Home</b> · flagged / settled / still open</sub></td>
    <td align="center"><sub><b>Scan</b> · with sample files to try</sub></td>
    <td align="center"><sub><b>Count</b> · what actually arrived</sub></td>
  </tr>
  <tr>
    <td><img src="docs/readme/2-flag.jpg" width="190" alt="A flag with the highlighted invoice line"/></td>
    <td><img src="docs/readme/5-supplier.jpg" width="190" alt="Supplier ledger"/></td>
    <td><img src="docs/readme/6-evidence.jpg" width="190" alt="Public evidence page the supplier opens"/></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Flag</b> · exact line highlighted</sub></td>
    <td align="center"><sub><b>Supplier</b> · pay now / disputed / credit</sub></td>
    <td align="center"><sub><b>Evidence</b> · what the supplier sees</sub></td>
  </tr>
</table>
</div>

---

## Try it in two minutes

1. Open the live demo and enter **`1234`** (owner: approves, sends, settles) or **`5678`** (staff: scan and count only). The PIN screen appears on every page load by design.
2. Tap **Imbas / Scan**, then **Cuba fail contoh / Try sample files**. Tap *Invois Borong Ali (has differences)*. The sample documents are synthetic, so you do not need photos of your own.
3. Review the read, save, enter the received counts, and see the flags in RM.
4. As owner, approve a flag, preview the message, and open WhatsApp.
5. Open the evidence link in a private window (no login) to see what the supplier sees.

The language can be switched between **BM and EN** from the header on every screen.

**Roles**
| Role | Can do |
|---|---|
| **Owner** | Everything: approve / dismiss / dispute / settle flags, send messages, mark paid, edit suppliers, export |
| **Staff** | Scan, correct what the AI read, record counts. Owner-only actions are hidden *and* blocked on the server (403) |
| **Supplier** | No login. Opens one read-only evidence page through an unguessable link |

---

## Demo script (about 2 minutes, four scenarios)

| # | Scenario | What to do | What you should see |
|---|---|---|---|
| 1 | **Correct delivery** | Scan → New delivery → *Lim Brothers delivery order (correct)* → save | Stamp **PENGHANTARAN TEPAT**, then *Sahkan tepat* |
| 2 | **Correct invoice** | Scan → Invoice → *Lim Brothers invoice (correct)* | **INVOIS TEPAT · RM285.60**, then *Tandakan sudah dibayar* |
| 3 | **Wrong delivery** | Scan → New delivery → *Signed bon (only 8 Maggi)* → change Maggi 10 → 8 | "1 perbezaan · Anggaran RM90.00" (an estimate; the ledger is untouched) |
| 4 | **Wrong invoice** | Scan → Invoice → *Borong Ali invoice (has differences)*, compare with that bon | "2 perbezaan · RM110.00": Maggi short RM90.00 and sugar +RM20.00 |

Then: approve → message → WhatsApp → evidence link (logged out) → *Selesaikan → Nota kredit* → the supplier's **Pay now drops RM962.00 → RM872.00**.

A freshly seeded demo shows Home **RM85.80 flagged · RM31.90 settled · RM53.90 still open**. Owners can reset the demo from *Settings → Set semula demo*.

---

## What it does

**Capture and read**
- Orders (notebook, WhatsApp), invoices, delivery bons. Photo, screenshot or PDF page 1.
- Gemini extracts structured fields with a highlighted box per line. Every read is editable before saving.
- Reads are cached by SHA-256; a fallback model and manual entry keep the demo alive if the AI is down.

**Check**
- Received counts per line. Untouched defaults are shown as *belum dikira* (not counted), never as verified receipt.
- Delivery is checked against the **complete order**: ordered / delivered / received / outstanding, including order lines the delivery never mentioned.
- Three rules, all in integer sen: **short quantity**, **price change** (agreed price, PO price or last invoice price, clearly labelled and *unverified* when it is only history), **not ordered** (with a "substituted?" guard).

**Decide and follow up**
- Owner approves or dismisses each flag, and can preview the draft message *before* approving.
- A factual BM/EN message with a read-only evidence page: the invoice with the line highlighted, the signed bon and delivery photos.
- Settlement records what the supplier **accepted** (amount and reference). A partial acceptance leaves the unrecovered balance tracked as its own disputed flag.
- Supplier ledger: pay now, under dispute, supplier credit, and expected statement balance. Credits reduce an unpaid invoice or carry forward after payment.
- Recounts after approval need the owner and a reason, and are logged with before and after values.
- Activity log of every write (who, role, action, time). 14-day follow-up reminders.

**Extras**
- Self-billed e-invoice **preview** for foreign suppliers (prepare → owner approves → release is logged only), with a completeness check and print / save as PDF.
- CSV export for the accountant, and a generic supplier-adjustments CSV.
- Orbyte / accounting partner: one labelled **simulation** sheet (roles, approvals, audit trail, credit wallet, handoff preview).

---

## How it works

```mermaid
flowchart LR
  A[Mobile browser<br/>React + TypeScript] -->|upload| B[Express API]
  B --> C[(Document storage<br/>Replit App Storage)]
  B -->|server-side only| D[Gemini via Vercel AI SDK<br/>Zod-validated fields]
  D --> E[Owner / staff confirm<br/>fields and counts]
  E --> F[(PostgreSQL<br/>Drizzle ORM)]
  F --> G[shared/core<br/>pure TypeScript rules<br/>integer sen]
  G --> H{Owner approves}
  H --> I[WhatsApp draft<br/>+ evidence link]
  H --> J[Ledger, CSV,<br/>activity log]
```

Design rules that keep it trustworthy:
- **The AI never computes.** It only fills an extraction schema. Flags, totals and balances come from `shared/core`, which has property-based and fixture tests.
- **Money is integer sen** end to end. Format only at render.
- **Nothing is auto-sent.** WhatsApp opens through a `wa.me` link the owner taps.
- **Owner-only actions are enforced on the server**, not just hidden in the UI.
- **Gemini is the only AI provider** (`gemini-3.8-flash`, falling back to `gemini-3.5-flash-lite`, then manual entry). It is only ever called from the server.

---

## Tech stack

| Layer | What we use |
|---|---|
| Client | React 19, Vite 8, TypeScript 5.9, Tailwind CSS 4, wouter, TanStack Query, motion, Radix UI, sonner, lucide-react |
| Server | Node 20, Express 5, `jose` (signed session cookie), multer, Zod |
| Data | PostgreSQL via Drizzle ORM and `pg`; documents in Replit App Storage (local-disk fallback) |
| AI | Google Gemini through the Vercel AI SDK (`ai`, `@ai-sdk/google`) |
| Tests | Vitest, fast-check (property-based), supertest |
| Hosting | Replit (deployment), with Replit PostgreSQL |

The full list of third-party libraries, versions and licenses is in the submission's Tech Declaration.

---

## Run it locally

**You need** Node 20+ and a PostgreSQL database.

```bash
git clone https://github.com/Srinivaas-only/Tepat-Bill-.git
cd Tepat-Bill-
npm ci

# point at any empty Postgres database
export DATABASE_URL="postgresql://user:pass@localhost:5432/tepat"

npm run db:push          # create tables (also safe to re-run)
npm run build            # builds the client and the server bundle (run from the repo root)

NODE_ENV=production STORAGE_DRIVER=disk DEMO_FIXTURES=1 SEED_ON_BOOT=1 \
OWNER_PIN=1234 STAFF_PIN=5678 SESSION_SECRET=0123456789abcdef0123456789abcdef \
PORT=5077 node dist/index.js
```

Open `http://localhost:5077/api/health`. You should see `ok`, `db` and `seeded` all `true` (`gemini` stays `false` without a key; the sample documents still read from the cache). Then open `http://localhost:5077` and log in with `1234` (owner) or `5678` (staff).

> `1234` and `5678` are **local development defaults only**. Production requires its own PINs and a real `SESSION_SECRET`.

Development mode with hot reload: `npm run dev`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `OWNER_PIN`, `STAFF_PIN` | yes in production | Two different 4-digit PINs |
| `SESSION_SECRET` | yes in production | 32+ random characters for signing session cookies |
| `GEMINI_API_KEY` | for live reads | Google AI Studio key. Without it the demo still works from cached sample reads and manual entry |
| `DEMO_FIXTURES=1` | demo | Enables sample documents, the "demo read" fallback and the demo reset |
| `SEED_ON_BOOT=1` | demo | Seeds the demo data into an empty database |
| `STORAGE_DRIVER` | optional | `disk` for local runs; Replit uses App Storage automatically |
| `PUBLIC_BASE_URL` | recommended | Public `https://` URL used in evidence links |

Do **not** set `NODE_ENV` as a Replit secret. The `start` script sets it. The server also applies small additive schema upgrades at every boot, so a redeploy without `db:push` does not break.

---

## Deploy on Replit

1. In the Repl Shell: `git pull origin main && npm install && npm run db:push && npm run build`.
2. Secrets: `OWNER_PIN`, `STAFF_PIN` (different 4-digit PINs), `SESSION_SECRET` (32+ characters), `GEMINI_API_KEY`, `DEMO_FIXTURES=1`, `SEED_ON_BOOT=1`, and Replit PostgreSQL (`DATABASE_URL`).
3. Publish. Check `<url>/api/health` (`ok`, `db`, `seeded`, `gemini` all true).
4. Log in as owner and tap *Settings → Set semula demo* to load the latest demo data.
5. The demo has 50 AI reads ("Baki semakan AI"); reset between testers.

---

## Tests

```bash
npm run typecheck
npm test                 # 248 tests; the API and scenario tests need DATABASE_URL (they use their own test schemas)
```

What is covered: the rules engine and ledger (including property-based invariants), delivery vs order fulfilment, message wording, the Gemini fallback chain, fixture reconciliation, permissions, evidence whitelisting, and end-to-end scenarios (the four demo scenarios, recounts, partial acceptance, evidence carry-through, the boot-time schema upgrade).

Regenerate the synthetic sample documents (needs Playwright and Chromium): `node fixtures/_generator/generate.mjs`.

---

## Project layout

```
client/src/     React app: pages, components, i18n (BM/EN), lib
server/         Express app, routes/, Drizzle access, seed, storage, accounting, schema upgrade
shared/core/    Pure, tested business logic: rules, ledger, delivery, messages, evidence, roles, e-invoice
shared/schema.ts  Drizzle tables
fixtures/       Synthetic demo documents, expected reads with true boxes, seed data, generator
docs/           PRD, decisions log, handoff notes, checklists
```

Start with [`docs/PRD.md`](docs/PRD.md) (product spec), [`docs/DECISIONS_LOG.md`](docs/DECISIONS_LOG.md) (every notable decision) and [`HANDOFF.md`](HANDOFF.md) (current state and how to verify it). `shared/core/` is the golden logic: it changes only with tests green.

---

## Honest scope

This is a hackathon prototype built to show one dependable journey, not a finished product.

- **Mock by design:** the Orbyte / accounting link is a labelled simulation, and the self-billed e-invoice is a preview. Nothing is submitted to LHDN, no payment is made, and no message is sent automatically. Opening WhatsApp means a *draft was opened*, not that it was delivered.
- **Synthetic data only.** The demo documents, shops and numbers are made up. Please do not upload real personal or confidential documents; uploaded files are sent to Gemini for reading.
- **Roles use shared PINs**, so individual accountability is limited. Evidence links do not expire.
- **Not measured yet:** accuracy on real handwritten documents, time saved, and real supplier recovery. Any RM figures shown are calculations on the demo data.
- The rules cover short quantity, price change and not ordered. Integer quantities only, and only page 1 of a PDF is read.

---

## Team and credits

Built by **Alt + Win + R** for the SDC Hackathon 2026 (hosted by the XMUM AI Club).

AI-assisted development is declared in the submission's Tech Declaration. Replit Agent, Claude Code and Codex were used as development tools, and the team reviews and is responsible for the result.

## License

[Apache-2.0](LICENSE)
