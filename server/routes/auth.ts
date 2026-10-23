import { Router } from 'express';
import { z } from 'zod';
import { COOKIE, getPins, makePinLimiter, pinMatches, readSession, signSession } from '../auth';
import { ApiError } from '../app';
import type { AppDeps } from '../app';
import { logEvent } from '../events';

export function authRouter(deps: AppDeps) {
  const r = Router();
  const limiter = makePinLimiter();
  r.post('/auth/login', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (limiter.blocked(ip)) throw new ApiError(429, 'rate_limited', 'Terlalu banyak cubaan. Cuba lagi sebentar.');
    const body = z.object({ pin: z.string().regex(/^\d{4}$/) }).safeParse(req.body);
    if (!body.success) throw new ApiError(400, 'bad_request', 'PIN tidak sah');
    const pins = getPins();
    const role = pinMatches(body.data.pin, pins.owner) ? 'owner' : pinMatches(body.data.pin, pins.staff) ? 'staff' : null;
    if (!role) { limiter.fail(ip); throw new ApiError(401, 'wrong_pin', 'PIN salah'); }
    res.cookie(COOKIE, await signSession(role), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 30 * 86_400_000, path: '/',
    });
    await logEvent(deps.db, role, 'auth.login', null);
    res.json({ role });
  });
  r.post('/auth/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
  r.get('/auth/me', async (req, res) => {
    const role = await readSession(req);
    if (!role) throw new ApiError(401, 'unauthorized', 'Sila log masuk');
    res.json({ role });
  });
  return r;
}
