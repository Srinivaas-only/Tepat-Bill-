> [!IMPORTANT]
> ## 📁 Submission Documents & Templates
> **All required submission templates are in the Google Drive folder below. Download them before you start.**
>
> ### 👉 [**OPEN THE GOOGLE DRIVE FOLDER**](https://drive.google.com/drive/folders/1xw7c2aN8N-at8hPEULzkcU76e_FFb0Ef) 👈

---

# Tepat Bill

> **Check every delivery. Check every bill.** A mobile-first web app that catches short deliveries, price changes and items that were never ordered, *before* a Malaysian kedai runcit pays for them.

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Node](https://img.shields.io/badge/Node-20-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-4169E1?logo=postgresql&logoColor=white)
![Gemini](https://img.shields.io/badge/AI-Gemini%20only-8E75B2)
![Tests](https://img.shields.io/badge/tests-248%20passing-2EA44F)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

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
      <b>&nbsp;&nbsp;&nbsp;MANAGER&nbsp;&nbsp;&nbsp;</b>
      <h1>&nbsp;&nbsp;🔑&nbsp;&nbsp;<code>5 6 7 8</code>&nbsp;&nbsp;</h1>
      <sub>Scan, count and record deliveries</sub>
      <br/><br/>
    </td>
  </tr>
</table>

**Live demo: https://tepat-bill.replit.app**

</div>

---

## Team Information

| Field                  | Details                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| **Team Name**          | Alt + Win + R                                                    |
| **Team Domain**        | Domain 2                                                         |
| **SDG Track (1–17)**   | SDG 8 — Decent Work and Economic Growth *(supporting: SDG 9)*    |
| **Team Leader**        | Isaac Toh Zhen Yong                                              |
| **University**         | Universiti Malaya                                                |
| **Number of Members**  | 5                                                                |

## Links

| Resource          | Link                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| GitHub Repository | https://github.com/Srinivaas-only/Tepat-Bill-                        |
| Live Demo         | https://tepat-bill.replit.app                                        |
| RunPod Endpoint   | Not used. The AI workload is hosted Google Gemini (see [How We Use RunPod](#how-we-use-runpod-required)) |
| Slide Deck        | *To be added by the team*                                            |
| Demo Video        | *To be added by the team*                                            |

---

## Overview

### Problem

A kedai runcit receives goods, gets a signed delivery bon, and later an invoice. Shortages and wrong items are noticed at the door, then forgotten by the time the bill arrives, so owners either overpay or spend hours finding evidence and chasing the supplier. Small shops have little margin to absorb this: at a 30.9% retail gross margin (DOSM Economic Census 2023, reference year 2022), RM100 of avoidable cost takes about RM324 of extra sales to earn back.

### Solution

Tepat Bill keeps **one record from delivery to invoice to supplier follow-up**, using the rule **AI reads → rules decide → the owner approves**.

1. **Snap** the order, the delivery bon and the invoice (photo, screenshot or PDF page 1). Google Gemini reads them.
2. **Count** what actually arrived. Managers type it; the AI never guesses counts.
3. **Compare** order ↔ bon ↔ invoice. Fixed, tested TypeScript rules turn differences into flags in exact RM: *short quantity*, *price change*, *not ordered*.
4. **Approve** (owner only) and open a ready-made WhatsApp message with a read-only **evidence link**.
5. **Track** the complaint until the supplier settles it (credit note, deduction or redelivery). The ledger shows what is still owed.

The AI never calculates amounts, and nothing is sent, paid or settled without the owner's approval.

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

### Key Features

- **Capture and read** — Orders, invoices and delivery bons from a photo, screenshot or PDF page 1. Gemini returns structured fields with a highlighted box per line; every read is editable before saving, cached by SHA-256, and backed by a fallback model and manual entry.
- **Honest counting** — Untouched defaults show as *belum dikira* (not counted), never as verified receipt. Delivery is checked against the **complete order** (ordered / delivered / received / outstanding), including order lines the delivery never mentioned.
- **Three exact rules in integer sen** — Short quantity, price change (agreed, PO or last-invoice price, clearly labelled *unverified* when it is only history) and not ordered (with a "substituted?" guard).
- **Owner approval and evidence** — Preview the draft before approving; a factual BM/EN message with a read-only evidence page showing the invoice line highlighted, the signed bon and the delivery photos.
- **Supplier-accepted settlement** — Records the amount and reference the supplier accepted. A partial acceptance keeps the unrecovered balance as its own disputed flag. The ledger shows pay now, under dispute, supplier credit and the expected statement balance.
- **Controlled corrections** — Recounts after approval need the owner and a reason, and are logged with before and after values. An activity log records every write.
- **Bilingual and role-based** — Bahasa Malaysia and English on every screen. The Owner can do everything; the Manager can scan, correct reads and record counts; the supplier opens one read-only evidence page with no login.
- **Extras (mock by design)** — Self-billed e-invoice preview for foreign suppliers (prepare → owner approves → release is logged only; no LHDN submission), CSV export, and a labelled Orbyte / accounting-partner simulation.

### Tech Stack

| Layer         | Technology                                                                     |
| ------------- | ------------------------------------------------------------------------------ |
| Frontend      | React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4, wouter, TanStack Query, motion |
| Backend       | Node.js 20, Express 5, TypeScript, Zod, `jose` (signed session cookie), multer |
| Database      | PostgreSQL via Drizzle ORM; documents in Replit App Storage (local-disk fallback) |
| AI / Compute  | Google Gemini API through the Vercel AI SDK (`gemini-3.8-flash`, fallback `gemini-3.5-flash-lite`). Hosted model, no self-hosted GPU |
| Hosting / Dev | Replit (deployment, Secrets, PostgreSQL); Vitest and fast-check for tests      |

### Try It in Two Minutes

1. Open the [live demo](https://tepat-bill.replit.app) and enter **`1234`** (Owner: approves, sends, settles) or **`5678`** (Manager: scan and count only). The PIN screen appears on every page load by design.
2. Tap **Imbas / Scan**, then **Cuba fail contoh / Try sample files**, and pick *Invois Borong Ali (has differences)*. The samples are synthetic, so you do not need photos of your own.
3. Review the read, save, enter the received counts, and see the flags in RM.
4. As Owner, approve a flag, preview the message and open WhatsApp.
5. Open the evidence link in a private window (no login) to see what the supplier sees.

Switch between **BM and EN** from the header on any screen.

| Role | Can do |
|---|---|
| **Owner** | Everything: approve / dismiss / dispute / settle flags, send messages, mark paid, edit suppliers, export |
| **Manager** | Scan, correct what the AI read, record counts. Owner-only actions are hidden *and* blocked on the server (403) |
| **Supplier** | No login. Opens one read-only evidence page through an unguessable link |

**Demo script (about 2 minutes, four scenarios)**

| # | Scenario | What to do | What you should see |
|---|---|---|---|
| 1 | **Correct delivery** | Scan → New delivery → *Lim Brothers delivery order (correct)* → save | Stamp **PENGHANTARAN TEPAT**, then *Sahkan tepat* |
| 2 | **Correct invoice** | Scan → Invoice → *Lim Brothers invoice (correct)* | **INVOIS TEPAT · RM285.60**, then *Tandakan sudah dibayar* |
| 3 | **Wrong delivery** | Scan → New delivery → *Signed bon (only 8 Maggi)* → change Maggi 10 → 8 | "1 perbezaan · Anggaran RM90.00" (an estimate; the ledger is untouched) |
| 4 | **Wrong invoice** | Scan → Invoice → *Borong Ali invoice (has differences)*, compare with that bon | "2 perbezaan · RM110.00": Maggi short RM90.00 and sugar +RM20.00 |

Then: approve → message → WhatsApp → evidence link (logged out) → *Selesaikan → Nota kredit* → the supplier's **Pay now drops RM962.00 → RM872.00**. A freshly seeded demo shows Home **RM85.80 flagged · RM31.90 settled · RM53.90 still open**. The Owner can reset the demo from *Settings → Set semula demo*.

---

## Project Structure

```
.
├── client/src/              # React app: pages, components, i18n (BM/EN), lib
├── server/
│   ├── routes/              # Express routes: documents, counts, flags, money, evidence, extras…
│   ├── index.ts             # Application entry point
│   ├── seed.ts              # Demo data + cached sample reads
│   ├── storage.ts           # Replit App Storage with local-disk fallback
│   ├── accounting.ts        # Labelled Orbyte / accounting simulation
│   └── schema-upgrade.ts    # Additive schema upgrades applied at every boot
├── shared/
│   ├── core/                # Pure, tested business logic: rules, ledger, delivery, messages, evidence, roles
│   └── schema.ts            # Drizzle tables
├── fixtures/                # Synthetic demo documents, expected reads, seed data, generator
├── docs/                    # PRD, decisions log, checklists, README screenshots
├── Submission/              # Submission documents (Replit proof of use)
├── .replit                  # Replit run and deployment configuration
├── HANDOFF.md               # Current state and how to verify it
├── LICENSE
└── README.md
```

### Architecture

```mermaid
flowchart LR
  A[Mobile browser<br/>React + TypeScript] -->|upload| B[Express API on Replit]
  B --> C[(Replit App Storage<br/>document bytes)]
  B -->|server-side only| D[Google Gemini<br/>via Vercel AI SDK<br/>Zod-validated fields]
  D --> E[Owner / Manager confirm<br/>fields and counts]
  E --> F[(PostgreSQL<br/>Drizzle ORM)]
  F --> G[shared/core<br/>pure TypeScript rules<br/>integer sen]
  G --> H{Owner approves}
  H --> I[WhatsApp draft<br/>+ evidence link]
  H --> J[Ledger, CSV,<br/>activity log]
```

Design rules that keep it trustworthy: **the AI never computes** (it only fills an extraction schema); **money is integer sen** end to end; **nothing is auto-sent** (WhatsApp opens through a `wa.me` link the owner taps); **owner-only actions are enforced on the server**; **Gemini is the only AI provider** and is only ever called from the server.

---

## How to Run

### Option 1 — Run on Replit (Recommended)

1. Open the Repl, or import this repository via **Create Repl → Import from GitHub**.
2. Open the **Secrets** tab (🔒) and add:
   - `OWNER_PIN` and `STAFF_PIN` — two different 4-digit PINs (`STAFF_PIN` is the Manager PIN)
   - `SESSION_SECRET` — 32 or more random characters
   - `GEMINI_API_KEY` — a Google AI Studio key
   - `DEMO_FIXTURES=1` and `SEED_ON_BOOT=1` — enable the sample documents and seed the demo data
   - `DATABASE_URL` — provided by Replit PostgreSQL
   - Do **not** set `NODE_ENV`; the start script sets it.
3. In the Shell run `npm install && npm run db:push && npm run build`, then click **Run** (or **Publish**).
4. Open `<your-url>/api/health`. `ok`, `db`, `seeded` and `gemini` should all be `true`. Log in as Owner and tap *Settings → Set semula demo*.

### Option 2 — Run Locally

You need Node 20+ and a PostgreSQL database.

```bash
# 1. Clone the repository
git clone https://github.com/Srinivaas-only/Tepat-Bill-.git
cd Tepat-Bill-

# 2. Install dependencies
npm ci

# 3. Point at an empty PostgreSQL database
export DATABASE_URL="postgresql://user:pass@localhost:5432/tepat"

# 4. Create tables and build (run from the repo root)
npm run db:push
npm run build

# 5. Run the app (local development defaults only)
NODE_ENV=production STORAGE_DRIVER=disk DEMO_FIXTURES=1 SEED_ON_BOOT=1 \
OWNER_PIN=1234 STAFF_PIN=5678 SESSION_SECRET=0123456789abcdef0123456789abcdef \
PORT=5077 node dist/index.js
```

Open `http://localhost:5077/api/health` (expect `ok`, `db`, `seeded` = `true`; `gemini` stays `false` without a key, and the sample documents still read from the cache), then open `http://localhost:5077`. For hot reload use `npm run dev`.

> `1234` and `5678` are demo defaults. A real deployment must use its own PINs and a real `SESSION_SECRET`.

### Run Tests

```bash
npm run typecheck
npm test        # 248 tests; the API and scenario tests need DATABASE_URL and use their own test schemas
```

Covered: the rules engine and ledger (including property-based invariants), delivery vs order fulfilment, message wording, the Gemini fallback chain, permissions, evidence whitelisting, and end-to-end scenarios (the four demo scenarios, recounts, partial acceptance, evidence carry-through, the boot-time schema upgrade).

---

## How We Use Replit *(Required)*

- **Development:** Replit Agent produced the initial scaffold from specs written with Claude Code; the team then refined the app with Claude Code and reviewed it with Codex. AI-assisted development is declared in the Technology Declaration.
- **Hosting:** The app is deployed with Replit Deployments at the Live Demo link above, with Replit PostgreSQL as the database.
- **Storage:** Uploaded documents are stored in Replit App Storage (with a local-disk fallback in the code).
- **Secrets:** The Gemini key, PINs and session secret live in Replit Secrets, never in the code.

📄 Proof of use: [`Submission/Proof of Use (Replit).pdf`](<Submission/Proof of Use (Replit).pdf>)

## How We Use RunPod *(Required)*

**Not used.** Tepat Bill's only AI workload is reading documents (extracting fields from invoice, order and bon images). That is done by the hosted **Google Gemini API**, called server-side through the Vercel AI SDK, so there is no self-hosted model, no GPU workload and no RunPod endpoint in this project. The code contains no RunPod workload.

📄 Proof of use: not applicable.

---

## Challenges & Learnings

- **Keeping the AI out of the maths.** We split the product into *AI reads → rules decide → the owner approves*. Every RM figure comes from pure, tested TypeScript in integer sen, which let us prove the numbers with property-based tests instead of trusting a model.
- **One quantity record.** An independent review found a bug where a billed-quantity default could hide the real count (an invoice showed "48 received" beside a "6 missing" flag). We fixed the root cause and added regression tests, then made untouched defaults visibly *not counted*.
- **Safe corrections.** Changing a count after approval now needs the owner and a reason, is logged with before and after values, and flags the affected complaints for recheck.
- **Redeploys must not break the database.** New columns reached the code before the deployed database. The server now applies small additive schema upgrades at every boot.
- **Being honest about scope.** Orbyte and the e-invoice are labelled mocks, and nothing is auto-sent or paid.

## Future Improvements

- [ ] Measure accuracy and time saved on a fresh, independently authored evaluation set and on real photographed documents
- [ ] Real Orbyte / accounting-partner integration once an API contract exists
- [ ] Verified LHDN MyInvois submission for self-billed e-invoices
- [ ] Individual user accounts instead of shared role PINs, plus evidence-link expiry and data retention controls
- [ ] Pilot with real kedai runcit owners and suppliers

## Team

| Name                                   | Role                              | GitHub                                                                   |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| Isaac Toh Zhen Yong                    | Team Leader                       | [@ISAACTOHZHENYONG-2025](https://github.com/ISAACTOHZHENYONG-2025)      |
| Ng Tze Fhung                           | Project Manager                   | [@jordanntf](https://github.com/jordanntf)                               |
| Vincent Loh Yong Sheng                 | Documentation and Submission Checker | [@VincentLohYongSheng-2025](https://github.com/VincentLohYongSheng-2025) |
| Srinivaas A/L Thiruch Selvam           | Full Stack Developer              | [@Srinivaas-only](https://github.com/Srinivaas-only)                     |
| Lievaashini A/P Thanasegaran           | Pitching Lead                     | [@Lievaashini](https://github.com/Lievaashini)                           |

--------------------- | ----------- | ------ |
| Isaac Toh Zhen Yong   | Team Leader | *to be added* |
| *Member name*         | *Role*      | *to be added* |
| *Member name*         | *Role*      | *to be added* |
| *Member name*         | *Role*      | *to be added* |
| *Member name*         | *Role*      | *to be added* |

---

## Submission Checklist

- [x] Team name, domain (Domain 2) and SDG track filled in
- [ ] Slide deck link added
- [ ] Demo video link added
- [x] Replit used, with proof of use in `Submission/`
- [ ] RunPod used, with proof of use in `submission/` *(not used; see above)*
- [ ] Preliminary submission completed (`SDC2026_TeamName_Preliminary.pdf`)
- [ ] Technology declaration completed (`SDC2026_TeamName_TechDeclaration.pdf`)
- [ ] Submission files renamed with your team name (replace `TeamName`)
- [x] "How to Run" steps verified
- [x] No API keys or secrets committed to the repository *(only documented demo PINs)*

## License

This project is licensed under the [Apache License 2.0](LICENSE).
