# Demo-day checklist (things only a human can do)

## T-3 days
- [ ] Billed Gemini key set in the **deployment** secrets; check quota and rate limits.
- [ ] Deployment secrets: `GEMINI_API_KEY`, `SESSION_SECRET` (≥32 chars), `OWNER_PIN` ≠ `STAFF_PIN`, `DEMO_FIXTURES=1`, `SEED_ON_BOOT=1`.
  - `PUBLIC_BASE_URL` = the `https://<app>.replit.app` URL, or leave it unset.
  - **Never** set `NODE_ENV` as a secret.
- [ ] Publish as a Reserved VM. Open `/api/health`: db true, storage `replit` (not disk), gemini true, demo true.
- [ ] Read 5+ real handwritten bons (PRD §12). Note the results in `docs/DECISIONS_LOG.md`.
- [ ] Full rehearsal on **both real phones** over mobile data. Time the live read 5×; if it's usually over 15 s, plan to use the gallery photo or "Guna bacaan demo".

## T-1 day
- [ ] Print at 100% on matte A4: INV-2291, DO-5512 (signed bon), DO-LB-0901 and LB-7810.
- [ ] Save the same PNGs to the owner phone's gallery (plan B).
- [ ] Log in with the owner PIN on the owner phone (the cookie lasts 30 days).
- [ ] Check that `wa.me` opens the contact picker on both iOS and Android. Pin the judge's or teammate's chat at the top.
- [ ] Record a full backup video of the demo.
- [ ] **No redeploys after this point.**

## T-60 min
- [ ] Both phones at 100% charge. Auto-lock, Do Not Disturb, battery saver and low-data mode all OFF. Brightness at maximum.
- [ ] Projector mirror tested (AirPlay, cast or USB).
- [ ] Use your own hotspot, not venue Wi-Fi.

## T-15 min
- [ ] Settings → **Set semula demo**.
- [ ] Home shows Selesai RM31.90 and Lim Brothers under "Perlu susulan". Checks chip reads 50. Language is BM.
- [ ] Close other tabs; reload the app on both phones. `/api/health` is ok.

## During
- If nothing has drawn by 7 s → **Guna bacaan demo** → pick the matching document.
- Approve **both** Maggi and Gula before opening the message.
- If WhatsApp doesn't open → **Salin mesej** and paste it.
- Don't open reminder messages after the final reset.

## After every rehearsal
- [ ] Reset immediately.
