import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';
import { type RowDataPacket } from 'mysql2/promise';
import { query } from '../db/pool';

// =============================================================================
// Customer auth primitives, adapted from mirror-server's proven flow:
// - HS256-pinned JWT carrying the password-changed timestamp (`pcat`), so a
//   password reset invalidates every previously-issued token.
// - unified password policy, iOS smart-character normalization, SHA-256 token
//   hashing for verify/reset links.
// =============================================================================

export interface CustomerTokenPayload {
  sub: number;
  email: string;
  pcat: number; // password_changed_at, epoch seconds
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

export function pcatOf(passwordChangedAt: string | Date): number {
  return Math.floor(new Date(passwordChangedAt).getTime() / 1000);
}

export function signCustomerToken(payload: CustomerTokenPayload): string {
  const expiresIn = process.env.CUSTOMER_JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, secret(), { expiresIn, algorithm: 'HS256' } as jwt.SignOptions);
}

export function verifyCustomerToken(token: string): CustomerTokenPayload {
  return jwt.verify(token, secret(), { algorithms: ['HS256'] }) as unknown as CustomerTokenPayload;
}

// --- password + token helpers ----------------------------------------------
export function normalizePassword(raw: string): string {
  return raw
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―−]/g, '-')
    .replace(/…/g, '...');
}

/** Unified policy: 8–128 chars, lower + upper + digit + one non-alphanumeric. */
export function passwordMeetsPolicy(pw: string): boolean {
  if (pw.length < 8 || pw.length > 128) return false;
  return /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

export const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// --- middleware -------------------------------------------------------------
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customer?: { id: number; email: string };
    }
  }
}

interface CustomerRow extends RowDataPacket {
  id: number;
  email: string;
  is_active: number;
  password_changed_at: string;
}

/**
 * Populate `req.customer` if a valid, current token is present, but never block
 * the request. Used on guest-friendly routes (checkout) so a logged-in buyer's
 * order can be linked to their account while guests still check out freely.
 */
export async function optionalCustomer(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    next();
    return;
  }
  try {
    const payload = verifyCustomerToken(token);
    const rows = await query<CustomerRow[]>(
      'SELECT id, email, is_active, password_changed_at FROM customers WHERE id = ?',
      [payload.sub],
    );
    const c = rows[0];
    if (c && c.is_active === 1 && pcatOf(c.password_changed_at) === payload.pcat) {
      req.customer = { id: c.id, email: c.email };
    }
  } catch {
    /* ignore — treat as guest */
  }
  next();
}

/** Require a valid customer token whose `pcat` still matches the DB (not reset since). */
export async function requireCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ success: false, error: 'Authentication required.' });
    return;
  }
  try {
    const payload = verifyCustomerToken(token);
    const rows = await query<CustomerRow[]>(
      'SELECT id, email, is_active, password_changed_at FROM customers WHERE id = ?',
      [payload.sub],
    );
    const c = rows[0];
    if (!c || c.is_active !== 1 || pcatOf(c.password_changed_at) !== payload.pcat) {
      res.status(401).json({ success: false, error: 'Session expired — please sign in again.' });
      return;
    }
    req.customer = { id: c.id, email: c.email };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired session.' });
  }
}
