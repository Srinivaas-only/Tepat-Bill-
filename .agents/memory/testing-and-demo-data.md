---
name: Testing and demo data quirks
description: Durable notes for browser-testing this app
---
Restart the "Start application" workflow after adding server routes before using curl or screenshots; a stale server returns 404 for new routes.
Browser testers need known PINs, which are secrets here: override them on the workflow for the run only and restart normally afterward.
After a tester run, reseed with the dev-only reset in Settings so the user sees clean demo data.
**Why:** secrets cannot be read; tester runs leave junk data.
