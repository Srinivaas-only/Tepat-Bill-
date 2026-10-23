import type { Request, Response, NextFunction } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual } from 'node:crypto';
import { can, type Action, type Role } from '../shared/core';
import { ApiError } from './app';

export const COOKIE = 'tb_session';

export function getPins() {
  const prod = process.env.NODE_ENV === 'production';
  const owner = process.env.OWNER_PIN ?? (prod ? '' : '1234');
  const staff = process.env.STAFF_PIN ?? (prod ? '' : '5678');
  const bad = [['OWNER_PIN', owner], ['STAFF_PIN', staff]].filter(([, v]) => !/^\d{4}$/.test(v)).map(([k]) => k);
  if (bad.length) throw new Error(`${bad.join(' and ')} must be exactly 4 digits`);
  if (owner === staff) throw new Error('OWNER_PIN and STAFF_PIN must differ');
  return { owner, staff };
}

const secretKey = () => {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is required in production');
    return new TextEncoder().encode('dev-only-session-secret-change-me-please');
  }
  return new TextEncoder().encode(s);
};

export const signSession = (role: Role) =>
  new SignJWT({ role }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(secretKey());

export async function readSession(req: Request): Promise<Role | null> {
  const t = req.cookies?.[COOKIE];
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secretKey(), { algorithms: ['HS256'] });
    return payload.role === 'owner' || payload.role === 'staff' ? payload.role : null;
  } catch { return null; }
}

export const pinMatches = (given: string, actual: string) => {
  const a = Buffer.from(given), b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** 5 wrong PINs per minute per IP (a success does not reset the count). */
export function makePinLimiter(max = 5, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  const recent = (ip: string, now: number) => (hits.get(ip) ?? []).filter(t => now - t < windowMs);
  return {
    blocked: (ip: string, now = Date.now()) => recent(ip, now).length >= max,
    fail: (ip: string, now = Date.now()) => { hits.set(ip, [...recent(ip, now), now]); },
    /** A successful login never clears the count; while the IP has recent failures it counts as an attempt too. */
    success: (ip: string, now = Date.now()) => { if (recent(ip, now).length > 0) hits.set(ip, [...recent(ip, now), now]); },
  };
}

declare module 'express-serve-static-core' { interface Request { role?: Role } }

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const role = await readSession(req);
  if (!role) throw new ApiError(401, 'unauthorized', 'Sila log masuk');
  req.role = role;
  next();
}
/** Route guard order: auth (401) -> can() (403) -> lookup (404). */
export const requireCan = (action: Action) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.role || !can(req.role, action)) throw new ApiError(403, 'forbidden', 'Hanya pemilik boleh melakukan ini');
  next();
};
