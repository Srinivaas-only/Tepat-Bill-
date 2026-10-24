# Tech Declaration fixes (SDC2026, Alt + Win + R)

Cross-checked against the app (`main`, 24 Oct 2026) by three independent reviews: code facts, licenses/assets, and template/consistency. Items marked **(team must confirm)** need a real answer from the team. Do not write a sentence that isn't true.

**Verdict:** what the document says the app *does* is accurate. The problems are wrong/blank fields, leftover notes, out-of-date text and missing declarations.

---

## A. Fix first (wrong or unfinished)

| # | Where | Now | Change |
|---|---|---|---|
| 1 | Section 1, "Project / Solution Name" | "Domain 2" | **Tepat Bill** |
| 2 | Header | "Submission Deadline: [Insert date]" | "25 October 2026" |
| 3 | Section 8, date | "[24/10/2026]" | "24 October 2026", plus the leader's printed name next to the signature |
| 4 | File name | `SDC2026_Alt__Win__R_TechDeclaration.docx.pdf` | `SDC2026_AltWinR_TechDeclaration.pdf` (template: `SDC2026_TeamName_TechDeclaration.pdf`; no `.docx`, no spaces or symbols) |
| 5 | Checkboxes (4.3, 5, 7) | render as "/" | real tick marks, or "[X] Yes" |

---

## B. Contradictions that must be settled before submitting

### 1. Is Replit an official SDC sponsor resource?  (team must confirm)
- **Declaration:** Section 5 ticks **Yes** ("Replit, Credits, hosts the deployed prototype"); 3.1 and 3.2 say "Sponsor-provided".
- **Preliminary proposal (3.1):** "Official sponsor-credit usage, account plan, deployment region and database provider require team evidence."
- Both cannot stand. Decide the truth and make **both documents** say the same:
  - If Replit credits came from SDC: keep Yes everywhere, and delete the "require team evidence" sentence in the proposal.
  - If not: tick **No** in Section 5, and change "Access tier / Plan" in 3.1 and 3.2 to the real plan (Free / Paid / Core).
- 3.2 "Plan / Region" currently says "Sponsor-provided". That is neither a plan nor a region. Write the real plan, and the region if known (team must confirm).

### 2. Section 6.2 and 4.3 are out of date
- **Quotes:** "Known prototype issues include inconsistent received counts, a count-to-invoice navigation failure, linked-evidence gaps and credit/currency edge cases. Fixes need regression testing before any stronger accuracy claim." and (4.3) "identified defects require regression testing before stronger accuracy claims are made."
- **Reality:** all four were fixed on 24 Oct and are covered by automated tests (248 tests passing in the repo).
- **Safe replacement for 6.2:** "Independent review found inconsistent received counts, a count-to-invoice navigation failure, evidence-linking gaps and credit/currency edge cases. We fixed them and added automated regression tests (248 in the repository). We will re-test the deployed app on a phone before the demo."
- 4.3 narrative: change the last sentence to "Automated tests in the repository cover the calculation, permission and evidence rules."
- Only keep "we will re-test on a phone" if the team really will.

### 3. "No LHDN submission" needs one honest clause (2.1)
- **Quote:** "There is no genuine Orbyte connection, automatic supplier messaging, bank payment or LHDN submission."
- **Reality:** the code contains a MyInvois (LHDN) submit module and an accounting webhook connector. Both are **off** unless credentials are set, and nothing in the repo sets them.
- **Add:** "LHDN MyInvois submission code and a signed accounting webhook exist but are disabled unless credentials are configured; none are configured and none were used. The Orbyte link is a labelled simulation."
- (team must confirm) that no `MYINVOIS_*` or `ACCOUNTING_WEBHOOK_*` secrets are set on the Replit deployment.
- Also in 2.1: "logged preview stub" is developer slang. Use "a logged preview only".

---

## C. Leftover internal notes (delete or answer them)

- **4.2, row 1, License:** "Repository Apache-2.0; verify authorship and asset exceptions." → "Team-created; Apache-2.0" (team must confirm all fixtures are our own work).
- **4.2, row 2, License:** "Repository Apache-2.0 subject to team ownership confirmation." → "Team-created; Apache-2.0".
- **6.1:** "Provider retention, database/storage region and account tier require confirmation." → state them (Gemini tier and terms, Replit database and storage region) (team must confirm).
- **6.1:** "No automatic retention deadline, per-record deletion or evidence-link expiry **was found**." → "The prototype has no automatic retention deadline, per-record deletion or evidence-link expiry." (This is true: evidence links never expire and demo reset leaves stored files and the extraction cache.)
- **4.2 fixtures provenance:** the sample PNGs were generated with Claude Code using `fixtures/_generator` (Playwright + Chromium, open-licensed fonts). They are synthetic and contain no third-party artwork. Say so.

---

## D. Blank or thin cells in 4.2 (template says write "None", never leave blank)

| Row | Fix |
|---|---|
| "Fresh evaluation set" (whole row empty) | Either fill: *Team-authored synthetic invoices with planted errors; Synthetic; Apache-2.0; N; planned for Phase 2 (team must confirm)*, or delete the row |
| DOSM / SDG statistics, License | "Public statistics (DOSM / UN open data)". Name it: Department of Statistics Malaysia, *Economic Census 2023: Wholesale and Retail Trade*, https://www.dosm.gov.my/portal-main/release-content/economic-census-2023-wholesale-and-retail-trade- ; add https://sdgs.un.org/goals/goal8 and /goal9 (team must confirm the exact license wording) |
| Cafe-owner interview | Source: "one interview with a cafe owner, [date] (team must confirm date)"; Self-collected; License: "Private, not published"; Personal data: **Y** if a name or transcript is stored, else N (team must confirm) |
| First column "-" in rows 1 and 2 | Name them: "Synthetic invoice fixtures", "Seed data" |

---

## E. Things the declaration does not declare yet (the template warns this can cost score)

### 2.2 add these rows (versions and licenses read from the installed packages)
| Name & version | Purpose | License |
|---|---|---|
| `pdfjs-dist` 5.6.205; `class-variance-authority` 0.7.1 | PDF first page; UI variants | Apache-2.0 |
| `@tanstack/react-query` 5.104.5; `motion` 14.6.0; Radix UI (`dialog` 1.3.1, `slot` 1.5.0, `tabs` 1.2.1); `sonner` 2.0.8; `clsx` 2.1.1; `tailwind-merge` 3.7.0; `tw-animate-css` 1.4.0; `react-zoom-pan-pinch` 4.2.0; `@number-flow/react` 0.6.2; `nanoid` 5.1.16 | UI, state, animation | MIT |
| `wouter` 3.13.0 | Routing | Unlicense (public domain) |
| `lucide-react` 1.61.0 | Icons | ISC |
| `multer` 2.5.0; `cookie-parser` 1.4.7; `compression` 1.8.2 | Uploads, cookies, server utilities | MIT |
| Geist and Geist Mono (`@fontsource-variable/*` 5.3.0, self-hosted) | Fonts | SIL OFL-1.1 |
| Kalam (Google Fonts) | Handwritten count font | SIL OFL-1.1 |
| `drizzle-kit` 0.31.11; `esbuild` 0.28.2; `tsx` 4.23.15; `vitest` 5.0.5; `supertest` 7.3.1; `fast-check` 4.10.2; `@vitejs/plugin-react`; `@tailwindcss/vite` (development only) | Build and tests | MIT |
| Playwright (fixture generator only, not in `package.json`) | Renders the sample document images | Apache-2.0 |

Also: the "Node.js 20.x configured" line is right. It is set in `.replit`; `package.json` has no `engines` field, so write "Node.js 20 (Replit module)".

### 3.1 External APIs: add
- **Google Fonts CSS/CDN** (`fonts.googleapis.com`, `fonts.gstatic.com`): loaded by the browser for the Kalam font. Free, no API key. (Section 6.1 already mentions it, so the two must match.)
- **WhatsApp wa.me:** the "Access Tier" cell currently says "Not WhatsApp Business API; no automated-message service". Write **"Free (consumer deep link, no API)"**.
- **Gemini "Free tier":** (team must confirm) the tier. Also add the Gemini-terms point to 6.1: on the free tier, Google's terms may allow submitted content to be used to improve products, and we only upload synthetic documents (team must confirm).

### 3.2 Cloud platforms: add the missing rows
- **PostgreSQL:** Replit-provisioned database (`DATABASE_URL`); plan/region (team must confirm).
- **Replit App Storage:** bucket configured in `.replit`.
- **Replit deployment:** currently "VM target in .replit". Note: the already-published deployment is **Autoscale**, while `.replit` says `vm`. State which one is actually live (team must confirm).

### Mobbin / Revolut reference (4.3 and 2.2)
Mobbin was used only as a design reference through MCP. Say that no screens, logos or assets were copied into the app (team must confirm), and add Mobbin as third-party reference material.

---

## F. Section 4.3 AI-assisted development tools

| Row | Problem | Change |
|---|---|---|
| "Claude Code / Anthropic -Opus 5.5/ Sonnet 5.5" | spacing, slash, stray hyphen; role "Refined the initial implementation afterward" understates a Major role | "Claude Code (Anthropic), Opus 5.5 and Sonnet 5.5. Wrote the PRD, tech stack, build prompts, the core rules engine, the demo fixtures and the later fix rounds (44 commits)." (versions: team must confirm) |
| "OpenAI Codex -6.1 Sol" | odd name/version; "Major" for review and documents only; "submission documents files" is garbled; there are no Codex commits in the repo | "OpenAI Codex (version: team must confirm). Independent code review, live read-only checks, and drafting submission documents." Extent: likely **Moderate**, not Major (team must confirm) |
| "Replit Agent; sonnet 5.5" | "Built the initial application" overstates it: the repo shows Claude wrote the spec, core rules and fixtures first, and Replit Agent made 9 of about 60 commits | "Replit Agent (model: team must confirm). Generated the Replit scaffold and parts of the UI, i18n, auth and backend from Claude-written specs." Extent: team must confirm |
| "Mobbin Pro via MCP" | fine, but also declare as reference material (see section E) | keep, Moderate |

- The narrative says "browser checks" while the table says "read-only live checks". Use the same words in both.
- Name who reviewed and tested the AI-written code, if a named person did (team must confirm).
- Say that AI tools also helped draft this document and the proposal, if true (team must confirm).

---

## G. Section 7 checklist and Section 6.x wording

- **"No API keys, passwords, or other credentials are exposed in the code repository":** a scan found **no real secrets** (no API keys, no `.env` committed, nothing in git history). But the repo does contain documented **development-default PINs 1234 / 5678**, a dev-only session fallback, and an example secret in `HANDOFF.md`. Do not tick a flat "no credentials". Add this line to 6.1 or 7: "No real credentials are committed. Documented development-default PINs (1234 / 5678) exist for non-production use; production requires secrets from environment variables." And (team must confirm) that the deployed `OWNER_PIN` / `STAFF_PIN` are **not** 1234 / 5678.
- **"All fields completed within the word limits":** true for the word limits (2.1 = 165/200, 4.3 = 72/100, 5 = 58/100, 6.1 = 131/150, 6.2 = 134/150), but **untick it until the placeholders and blank cells above are fixed**. Recount after editing; you have about 35 / 28 / 42 / 19 / 16 words of room.
- **Tone:** keep one honest scope sentence per section. Drop the repeats ("This is not a claim of production privacy compliance", "No claim of perfect detection ... is made", "These paths do not constitute independent-reader voting"). They read as unsure.
- The "Repository URL" is right (`https://github.com/Srinivaas-only/Tepat-Bill-`). Remove `.git` at the end, and (team must confirm) the repository is public or access is granted to judges.
- Section 1 lists only the leader. Add the other members if the template allows.

---

## H. Already correct (don't touch)
- All versions and licenses already in 2.2.
- 2.1 architecture: Express on Replit, Drizzle/PostgreSQL, Replit App Storage with local-disk fallback, Gemini server-side via the Vercel AI SDK, Zod validation, hash cache, fallback model and manual entry, integer sen, owner/staff PIN sessions, editable WhatsApp draft, scoped evidence link, CSV export, e-invoice preview.
- 6.1 privacy facts: HttpOnly signed session cookie; evidence links never expire; no retention or deletion; demo reset does not delete stored files or the extraction cache; Google Fonts request; Gemini receives the document image or PDF page 1.
- 4.1 models: `gemini-3.8-flash` and `gemini-3.5-flash-lite`.
- 3.2: "VM target in .replit" matches the file (but see the Autoscale note in section E).
