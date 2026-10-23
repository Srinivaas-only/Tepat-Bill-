# Tepat Bill

> Check every delivery. Check every bill. A mobile-first app that catches short deliveries, price changes and items that weren't ordered before a Malaysian *kedai runcit* pays for them.

---

## Team Information

| Field                  | Details                                     |
| ---------------------- | ------------------------------------------- |
| **Team Name**          | Tepat Bill *(confirm)*                      |
| **Team Domain**        | Domain 2 *(Orbyte Smart SME Challenge)*     |
| **SDG Track (1–17)**   | *TBC*                                       |
| **Team Leader**        | *TBC*                                       |
| **University**         | *TBC*                                       |
| **Number of Members**  | *TBC*                                       |

## Links

| Resource          | Link                                           |
| ----------------- | ---------------------------------------------- |
| GitHub Repository | https://github.com/Srinivaas-only/Tepat-Bill-  |
| Replit Project    | *TBC*                                          |
| Live Demo         | *TBC (`https://<your-app>.replit.app`)*        |
| RunPod Endpoint   | *Not used, see "How We Use RunPod"*           |
| Slide Deck        | *TBC*                                          |
| Demo Video        | *TBC*                                          |

---

## Overview

### Problem

Small shops in Malaysia (*kedai runcit*) receive deliveries and invoices from suppliers every week, and the owner often pays for what was never delivered, delivered short, re-priced without notice, or never ordered. Staff count the goods by hand, and the owner checks the invoice against a notebook or a WhatsApp order. Most mismatches are caught late, or not at all, and the shop absorbs the cost. The owners most affected run the business alone or with one helper, and they have no accounting team to check.

### Solution

Tepat Bill turns the check into a short workflow. Staff photograph or upload the order, invoice or delivery order (photo, screenshot or PDF) and type the quantities they received. **Gemini reads every line** and records where on the page it read it. **Tested, deterministic code** (never the AI) computes every RM difference. The owner approves each flag, and one tap opens WhatsApp with a factual message to the supplier that links to a read-only evidence page, where the supplier sees the exact invoice line highlighted. The app then tracks each complaint until it is settled, and shows what the shop still owes.

**AI reads → rules decide → the owner approves.** The app never sends, pays or settles anything by itself, and it never decides who is right.

### Key Features

- **Document reading** — Gemini reads orders, invoices and delivery orders in BM, English and Chinese, from a photo, screenshot or PDF page 1. Owners can correct any AI read.
- **Three flag rules** — Short delivery, price change against the agreed baseline, and items not ordered (with a substitution guard).
- **Owner approval and WhatsApp** — Nothing is sent automatically. The owner reviews each flag and taps to open a prepared WhatsApp message in BM or EN.
- **Tap-to-proof evidence page** — A public, read-only, unguessable link per flag showing the highlighted line and the signed bon. No login for the supplier.
- **Money tracking** — Settle, dispute or reopen each flag, record credit notes, and see "Pay now" and the expected supplier statement balance.
- **Follow-ups and activity** — 14-day reminder drafts, a home summary of the last 30 days, and an activity log of every action.
- **Roles** — Owner and Staff PINs, enforced on the server. Staff can record counts but cannot approve, send, settle or pay.
- **Extras** — Self-billed e-invoice *preview* stub for foreign invoices (not submitted to LHDN), CSV export, and "checks left" tracking.

### Tech Stack

| Layer         | Technology                                                                 |
| ------------- | -------------------------------------------------------------------------- |
| Frontend      | React 19, Vite 8, TypeScript, Tailwind CSS 4, shadcn/ui, `motion`, wouter  |
| Backend       | Express 5, TypeScript, multer, jose (session cookie)                       |
| Database      | Replit PostgreSQL with Drizzle ORM; Replit App Storage for photos          |
| AI / Compute  | Gemini only, via Vercel AI SDK 7 (`gemini-3.8-flash`, fallback `gemini-3.5-flash-lite`) |
| Testing       | Vitest, fast-check (property-based), supertest                             |
| Hosting / Dev | Replit (development and Reserved VM deployment)                            |

Full rationale and pinned versions are in [`TECH_STACK.md`](TECH_STACK.md).

---

## Project Structure

```
.
├── src/
│   ├── client/                  # React app (Vite root)
│   │   ├── index.html
│   │   └── src/
│   │       ├── pages/           # Screens: scan, read, review, count, flags, evidence, suppliers, ...
│   │       ├── components/      # Shared UI (flag card, message sheet, photo viewer, ...)
│   │       ├── i18n/            # ms.ts (Bahasa Malaysia, default) and en.ts
│   │       └── lib/             # API client, auth, money input, image downscale
│   ├── server/
│   │   ├── index.ts / app.ts    # Express entry point and app factory
│   │   ├── routes/              # documents, extract, counts, flag-actions, evidence, money, ...
│   │   ├── gemini.ts            # Gemini calls (server only)
│   │   ├── storage.ts           # Replit App Storage, keyed by SHA-256
│   │   ├── auth.ts              # PIN login and role middleware
│   │   └── api.test.ts          # API tests (run against a separate Postgres schema)
│   └── shared/
│       ├── schema.ts            # Drizzle tables and Zod schemas
│       └── core/                # Tested business logic: rules, ledger, roles, messages,
│                                #   evidence, e-invoice stub, Gemini extraction schema
├── fixtures/
│   ├── docs/                    # Synthetic demo documents (PNG) and expected reads (JSON)
│   ├── _generator/              # Script that regenerates the demo documents
│   └── seed.json                # Demo seed data
├── submission/                  # Required submission documents (placeholders for now)
├── docs/
│   ├── PRD.md                   # Product requirements: stories, screens, data model, demo script
│   ├── BUILD_PROMPT.md          # How the app was built with Replit Agent
│   ├── IMPLEMENTATION_NOTES.md  # Exact wiring and UI specs
│   ├── PROGRESS.md              # Milestone log
│   └── DECISIONS_LOG.md         # Decisions taken where the PRD was silent
├── .replit                      # Replit run and deployment configuration
├── replit.md                    # Standing rules for Replit Agent
├── TECH_STACK.md                # Stack and reasons
├── vite.config.ts · vitest.config.ts · drizzle.config.ts · tsconfig.json · components.json
├── package.json · package-lock.json
├── LICENSE                      # Apache License 2.0
└── README.md
```

> `submission/` holds the four required submission PDFs. They are placeholders until the real documents are ready.

### Architecture

```
Staff / Owner phone ──► Replit (Express API + React app) ──► Gemini API (document reading)
                              │
                              ├──► Replit PostgreSQL (flags, ledger, events)
                              ├──► Replit App Storage (document photos)
                              └──► src/shared/core (rules: every RM figure is computed here)

Owner taps "Buka WhatsApp" ──► WhatsApp (wa.me link) ──► Supplier opens /e/:token (read-only evidence)
```

---

## How to Run

### Option 1 — Run on Replit (Recommended)

1. Open the Replit project, or import this repository via **Create Repl → Import from GitHub**.
2. Open the **Secrets** tab (🔒) and add the variables below.
3. Provision the database and load the demo data once:
   ```bash
   npm run db:push
   npm run seed
   ```
4. Click **Run**. The `.replit` file starts `npm run dev` on port 5000.

Secrets used by the app:

- `GEMINI_API_KEY` — required for live document reading. Use synthetic documents only with a free-tier key.
- `DATABASE_URL` — Replit PostgreSQL connection string.
- `SESSION_SECRET` — random string of 32 or more characters.
- `OWNER_PIN` and `STAFF_PIN` — 4-digit PINs (the demo seed uses 1234 and 5678 in development).
- `DEMO_FIXTURES` — set to `1` to show the "Guna bacaan demo" fallback if Gemini is unavailable.
- `PUBLIC_BASE_URL` — the published `.replit.app` URL, so evidence links in WhatsApp messages work.

### Option 2 — Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/Srinivaas-only/Tepat-Bill-.git
cd Tepat-Bill-

# 2. Install dependencies (Node 22)
npm install

# 3. Configure environment variables (a PostgreSQL DATABASE_URL and the secrets above)
#    Set them in your shell or in a local .env file (which is git-ignored)

# 4. Apply the schema and load demo data
npm run db:push
npm run seed

# 5. Run the app (client and server on one port)
npm run dev
```

### Run Tests

```bash
npm test                 # Unit and API tests (API tests need DATABASE_URL)
npm run typecheck:core   # Type-check the shared business logic
npm run typecheck        # Type-check the whole project
```

Regenerate the demo documents (needs Playwright and Chromium):

```bash
node fixtures/_generator/generate.mjs
```

---

## How We Use Replit *(Required)*

- **Development:** The app was built with Replit Agent, following a milestone plan in [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md). Later polish is done with Claude Code through this GitHub repository.
- **Hosting:** Configured for a Replit **Reserved VM** deployment (`npm run build`, then `npm run start`), planned for the demo so there is no cold start. The `.replit` file defines the run and deployment settings.
- **Database and storage:** Replit PostgreSQL holds the flags, ledger and activity log. Replit App Storage holds the document photos, keyed by SHA-256 so duplicates are stored once.
- **Secrets:** API keys and PINs are stored in Replit Secrets, never in the code.

📄 Proof of use: `submission/SDC2026_TeamName_Replit_POU.pdf` *(to be added)*

## How We Use RunPod *(Required)*

> **Not yet used.** The project's AI engine is Gemini (via the Vercel AI SDK), and [`TECH_STACK.md`](TECH_STACK.md) states that Gemini is the only AI provider. The organiser's template lists RunPod as required, so this section must be completed before submission. Either a RunPod Serverless endpoint must be added for part of the workload (for example, the document-reading step), or the organiser must confirm that RunPod is optional for this track.

📄 Proof of use: `submission/SDC2026_TeamName_Runpod_POU.pdf` *(to be added once RunPod is used)*

---

## Challenges & Learnings

- **Keeping the AI out of the arithmetic.** Gemini reads the documents, but every RM figure comes from pure, tested functions in `src/shared/core`, using integer sen, so the numbers can be reproduced and checked.
- **Making the reading moment reliable.** Structured output from Gemini can fail or time out, so reads are cached by SHA-256, retried on a cheaper model, and fall back to pre-read demo fixtures or manual entry. The demo does not depend on a live API call.
- **Tying each flag to the source.** Gemini returns a bounding box for every line (`box_2d`). The box is display-only: a bad box never changes a flag, and the row highlight is the fallback.
- **Designing for a kedai runcit owner.** The UI is Bahasa Malaysia by default, uses large touch targets, and works at 390px width. The supplier message is drafted in BM or EN.

## Future Improvements

- [ ] Damaged and expired goods flags
- [ ] Counting stock from photos
- [ ] Auto-sending messages and supplier payments (kept out on purpose for now)
- [ ] Submitting self-billed e-invoices to LHDN (currently a preview only)
- [ ] Accounting integrations beyond CSV export
- [ ] Multi-shop support and sign-up
- [ ] Negotiated price lists beyond "agreed price"

## Team

| Name        | Role                | GitHub                                   |
| ----------- | ------------------- | ---------------------------------------- |
| *TBC*       | Team Lead           | *TBC*                                    |
| *TBC*       | *TBC*               | *TBC*                                    |
| *TBC*       | *TBC*               | *TBC*                                    |

---

## Submission Checklist

- [ ] Team name, domain (Domain 2) and SDG track filled in
- [ ] Slide deck link added
- [ ] Demo video link added
- [x] Replit used
- [ ] Replit proof of use in `submission/`
- [ ] RunPod used, with proof of use in `submission/` *(not yet used, see above)*
- [ ] Preliminary submission completed (`SDC2026_TeamName_Preliminary.pdf`)
- [ ] Technology declaration completed (`SDC2026_TeamName_TechDeclaration.pdf`)
- [ ] Submission files renamed with the team name
- [ ] "How to Run" steps verified
- [ ] No API keys or secrets committed to the repository (`.env` is git-ignored)

## License

This project is licensed under the [Apache License 2.0](LICENSE).
