# Tepat Bill

**Check every delivery. Check every bill.** A mobile-first app that catches short deliveries, price changes and items that weren't ordered before a Malaysian *kedai runcit* pays for them.

> SDC Hackathon 2026 · Domain 2 · Orbyte Smart SME Challenge · Team **Alt+Win+R**

**AI reads → rules decide → the owner approves.** Gemini reads orders and invoices (photo, screenshot or PDF). Tested code computes every RM difference. The owner approves and sends a factual WhatsApp message with a read-only evidence link. The app tracks every complaint until it is settled, and what is still owed.

## Start here
| File | What it is |
|---|---|
| [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md) | **How to build it with Replit Agent**: runbook, master prompt, recovery prompts |
| [`docs/PRD.md`](docs/PRD.md) | Full product requirements: stories, screens, design system, data model, API, demo script |
| [`replit.md`](replit.md) | Standing rules Replit Agent reads every run |
| [`TECH_STACK.md`](TECH_STACK.md) | The stack and why |
| [`shared/core/`](shared/core) | Tested business logic: flags, ledger, roles, messages, evidence, Gemini reader |
| [`fixtures/`](fixtures) | Synthetic demo documents, expected reads with true boxes, seed data |

## Tests
```bash
npm ci
npm test            # core: rules, ledger (property-based), delivery, messages, Gemini fallback, fixture reconciliation + hardening regressions.
                    # API and scenario tests need a Postgres: set DATABASE_URL (they run in a separate `test` schema)
npm run typecheck:core
```

Regenerate the demo documents (needs Playwright and Chromium): `node fixtures/_generator/generate.mjs`
