# Proposal fixes (SDC2026 Phase 1, Alt + Win + R)

Cross-checked against the app (`main`, 24 Oct 2026). Everything the proposal says the app *does* is correct. The problems are in the wording around it. Work top to bottom: the first group is the stuff that can hurt us most. Items marked **(you must confirm)** need a real answer from the team; do not guess or copy a sentence that isn't true.

---

## A. Fix first

### 1. Section 5 checklist contradicts the text  (you must confirm)
- **Where:** Section 5 ticks "All team members have completed the mandatory GenAI, Database, and Cloud Deployment upskilling workshops", "verified real-world problem" and "All fields ... completed".
- **Problem:** Section 2.2 says "individual attendance and actual workshop application require team confirmation", and 2.1 says the interview notes "are still to be supplied". A judge reads both and sees we ticked what we say is unconfirmed.
- **Change:** Confirm who attended. If everyone did, say so in 2.2 and name the skills actually used (we used Gemini API extraction = GenAI, PostgreSQL with Drizzle = Database, Replit deployment = Cloud). If anyone didn't, untick the box and say so honestly.

### 2. Leftover internal notes in 3.1, 3.2, 2.2
Delete these, they read like to-do notes to ourselves:
- 3.1: "successful live model execution and account tier require separate verification"
- 3.1: "Official sponsor-credit usage, account plan, deployment region and database provider require team evidence. The code contains no RunPod workload; the team must confirm whether RunPod was used separately."
- 3.1: "The team reports using it for deployment only", "Claude Code was used ... according to the team; Codex assisted review and documentation"
- 3.2: "Interview notes should be retained to show ..." and "Further cafe-owner feedback should test ..."
- 2.2: "individual attendance and actual workshop application require team confirmation"

Say what we did in plain first person instead ("We deployed on Replit with its managed PostgreSQL and used the Gemini API for extraction.").

### 3. 3.1 never answers the template's yes/no question  (you must confirm)
- **Question in the template:** "Did your project utilize any official SDC sponsor-provided GenAI API or Cloud Platform? If yes, specify which one."
- **Change:** Start the box with a clear **Yes** or **No**. If no: "No sponsor-provided API or platform was used; we used the Gemini API (our own key) and Replit." If yes, name it and how it was used.
- The template also asks for "a simple system block diagram". We only have a one-line flow. Either attach a small diagram as an appendix or add one.
- RunPod: the app has none. Only mention it if the organiser said it is required.

### 4. Section 3.2 and the end of 2.2 are out of date
- **Quote:** "Review has identified count inconsistencies, a count-to-invoice navigation failure, evidence-linking gaps and calculation edge cases. Before the final demo, we plan to repair these issues ..." and, at the end of 2.2, "Phase 2 refinement prioritises consistent counts, reliable navigation, evidence linkage, approval transitions and calculation edge cases."
- **Problem:** All of these are already fixed on `main` (three review rounds on 24 Oct, regression tests in `server/scenarios.test.ts`, 248 automated tests passing). Writing "we plan to repair" tells judges the app is broken when it isn't, and a list of known bugs doesn't belong in a proposal either way.
- **Change (safe wording):** "Independent review found count inconsistencies, a count-to-invoice navigation failure, evidence-linking gaps and calculation edge cases. We fixed these and covered them with automated regression tests (248 tests). Before the final demo we will re-test the full journey on the deployed app and on a phone."
- For the 2.2 ending, replace the bug list with the real Phase 2 plan (see item 5): a fresh evaluation set, phone testing and more owner feedback.

### 5. Section 4 baseline and KPI are circular
- **Quote:** "invoice LB-7781 ... RM53.90 of overbilling exposure before checking: RM41.40 for six missing units and RM12.50 from a price difference" and the KPI "Undetected supplier overbilling remaining after checking".
- **Problem:** The numbers are right (6 x RM6.90 = RM41.40; 50 x RM0.25 = RM12.50; total RM53.90; 75% = RM40.43, leaving RM13.47). But those two flags are *seeded* in `fixtures/seed.json`, and the app reproduces them by design. So "we will find 75% of it" is really 100% by construction. A sharp judge will notice. Also RM53.90 is the sum of two flags, not the invoice (the invoice total is RM593.70), so don't call it "the invoice's overbilling" without saying that.
- **Change:**
  - Call LB-7781 a "test fixture" that shows the app catches the two planted errors (it does).
  - Make the KPI a measurement on **new** documents someone else authors with known planted errors, e.g. "On [N] fresh synthetic delivery-invoice cases with known errors, detect at least X% of the RM value with no more than Y% false flags." Pick N, X and Y numbers we can really produce before the demo. Keep the existing control cases (correct invoices that must raise no flag).
  - Keep the line "development target, not an achieved result". That part is honest and fine.

---

## B. Citations and facts

### 6. DOSM figure needs a real citation (2.1 and Section 4)
- **Quote:** "DOSM reports a retail gross margin of 30.9% in Economic Census 2023, referring to 2022."
- **Change:** Name the source and add the link: Department of Statistics Malaysia, *Economic Census 2023: Wholesale and Retail Trade* (reference year 2022), https://www.dosm.gov.my/portal-main/release-content/economic-census-2023-wholesale-and-retail-trade-
- Show the sum once: RM100 / 0.309 = RM323.62, "about RM324".
- Section 4 says to cite every source, and right now it only cites the UN goal pages. Add the DOSM link there too.
- Our interview is with a **café** owner but 30.9% is the **retail** margin. Add one clause saying it is used as an illustration, or say the target user is the kedai runcit and the café owner was early discovery.

### 7. Interview evidence  (you must confirm)
- 2.1 and 3.2 say "one interview with a cafe owner". The pitch deck (slide 2) says "our shop-owner interviews" (plural). Make the two match the truth. Add the date, and attach or reference the notes if we have them.

### 8. SDG sub-targets (Section 4)
Tie each mapping to the official wording (check the exact text on sdgs.un.org/goals/goal8 and goal9 before pasting):
- **8.2** "higher levels of economic productivity through diversification, technological upgrading and innovation": fine as is. Say it is about *technological upgrading* of manual delivery and invoice checking.
- **8.3** is about "formalization and growth of micro-, small- and medium-sized enterprises, including through access to financial services". Our current line ("identify potential overbilling") is a stretch. Reword to: protects SME cash flow by catching billing errors before payment and keeps auditable records.
- **9.3** "integration ... into value chains and markets": our text leans on "reusable Orbyte integration", which we do **not** have (2.2 says so). Either drop the Orbyte part or say "designed to plug into Orbyte". Or call 9.3 supporting only.

---

## C. Small fixes

| Where | Now | Change to |
|---|---|---|
| Section 1, project name | "Tetap Bill" | "Tepat Bill" (everywhere else says Tepat) |
| File name | `SDC2026__Alt__Win__R_Preliminary.docx.pdf` | `SDC2026_AltWinR_Preliminary.pdf` (template says `SDC2026_TeamName_Preliminary.pdf`; drop `.docx`) |
| Section 5 checkboxes | show a "/" | real ticks, or a clear checked symbol |
| Section 7 date | "[24/10/2026]" | "24 October 2026", add the leader's printed name next to the signature |
| Section 1 | only the leader is named | add the other members' names if the template allows |
| 6.2 library table | incomplete (see below) | use the full list below |
| Tone | many "this is not proof / not claimed" disclaimers (2.1, 2.2, 3.2, Section 4) | keep **one** short honest scope sentence, drop the repeats; it reads as unsure |

### 6.2 / 2.2 library list (versions are from the repo, licenses from each package)
| Name & version | Purpose | License |
|---|---|---|
| TypeScript 5.9.3; Node.js 20.x (Replit) | Language and runtime | Apache-2.0; MIT |
| React / react-dom 19.3.1; Vite 8.3.5; Tailwind CSS 4.3.3 | Browser app and build | MIT |
| Express 5.3.0; pg 8.23.1; Drizzle ORM 0.45.4 (+ drizzle-kit) | API and PostgreSQL | MIT; MIT; Apache-2.0 (drizzle-kit MIT) |
| Vercel AI SDK (`ai`) 7.0.149; `@ai-sdk/google` 4.0.103 | Calls Gemini | Apache-2.0 |
| Google Gemini models (`gemini-3.8-flash`, `gemini-3.5-flash-lite`) | Reads document fields | Google Gemini API terms (hosted model, not open source) |
| Zod 4.6.7 | Validates AI output | MIT |
| pdf.js (`pdfjs-dist`); class-variance-authority | PDF first page; UI variants | Apache-2.0 |
| TanStack Query 5.104.5; motion 14.6.0; Radix UI (dialog, tabs, slot); sonner; clsx; tailwind-merge; tw-animate-css; react-zoom-pan-pinch; @number-flow/react | UI, state, animation | MIT |
| wouter 3.13.0 | Routing | Unlicense |
| lucide-react | Icons | ISC |
| jose 6.2.13; multer 2.5.0; cookie-parser; compression; nanoid | Session cookie, uploads, server utilities | MIT |
| `@replit/object-storage` | Document storage on Replit | MIT |
| PostgreSQL | Database | PostgreSQL License |
| Geist and Geist Mono (`@fontsource-variable`); Kalam (Google Fonts) | Fonts | SIL OFL-1.1 |
| Vitest 5.0.5; fast-check; supertest; esbuild; tsx (development only) | Tests and build | MIT |
| Team synthetic documents + expected JSON | Demo and evaluation data | Repository Apache-2.0 |

---

## D. What is already right (don't change)
- All "what the app does" statements: Gemini extracts, users correct, TypeScript rules (not AI) compute RM, owner approves, WhatsApp link opens a draft (not auto-sent), accepted credits reduce an unpaid balance or carry forward, e-invoice is a preview only, CSV export, no real Orbyte integration, no RunPod.
- All version numbers in 2.2 and 3.1.
- Word limits: 2.1 = 201/250, 2.2 = about 225/300, 3.2 = 169/200. The fixes above add words, so recount after editing (3.2 has about 30 words of room).
- Do not paste any sentence claiming things we haven't confirmed (workshop attendance, sponsor credits, number of documents tested).
