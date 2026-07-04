import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { type RowDataPacket } from 'mysql2/promise';
import { query, execute } from '../../db/pool';
import { sendEmail, escapeHtml } from '../../services/emailService';
import {
  signCustomerToken,
  requireCustomer,
  normalizePassword,
  passwordMeetsPolicy,
  EMAIL_RX,
  hashToken,
  pcatOf,
} from '../../auth/customer';

// =============================================================================
// Customer accounts (optional; guest checkout still supported). Mirrors
// mirror-server's register/login/verify/forgot/reset flow. bcrypt cost 12,
// generic anti-enumeration responses, SHA-256 hashed email links, single-use.
// =============================================================================

const router = express.Router();
const BCRYPT_COST = 12;
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO3f6f7b4Yb6y8s6b5b4Yb6y8s6b5b4Ya';
const APP_URL = () => process.env.APP_URL || 'https://www.theundergroundrailroad.world/GabrielGomez';

// Per-IP limiter for register/login/forgot.
const WINDOW_MS = 15 * 60 * 1000;
const MAX = Number(process.env.ACCOUNT_RATE_LIMIT || 15);
const hits = new Map<string, { count: number; start: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of hits) if (now - w.start > WINDOW_MS) hits.delete(k);
}, WINDOW_MS).unref();
function limited(ip: string): boolean {
  const now = Date.now();
  const w = hits.get(ip);
  if (!w || now - w.start > WINDOW_MS) {
    hits.set(ip, { count: 1, start: now });
    return false;
  }
  if (w.count >= MAX) return true;
  w.count += 1;
  return false;
}

interface CustomerRow extends RowDataPacket {
  id: number;
  email: string;
  name: string | null;
  password_hash: string;
  email_verified: number;
  is_active: number;
  password_changed_at: string;
}

// Attach any prior guest orders with this email to the account.
async function linkGuestOrders(customerId: number, email: string): Promise<void> {
  await execute('UPDATE orders SET customer_id = ? WHERE email = ? AND customer_id IS NULL', [customerId, email]);
}

async function issueVerifyEmail(customerId: number, email: string, name: string | null): Promise<void> {
  const raw = crypto.randomBytes(32).toString('hex');
  await execute(
    `INSERT INTO customer_tokens (customer_id, token_hash, purpose, expires_at)
     VALUES (?, ?, 'verify', DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
    [customerId, hashToken(raw)],
  );
  const url = `${APP_URL()}/verify-email?token=${raw}`;
  void sendEmail({
    to: email,
    subject: 'Verify your SonSoul email',
    html: `<div style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f4f4f4;padding:24px;border-radius:12px;max-width:520px;margin:auto">
      <h2 style="font-weight:300">Welcome${name ? `, ${escapeHtml(name)}` : ''}</h2>
      <p style="color:#cfcfcf">Confirm your email to finish setting up your account.</p>
      <p><a href="${url}" style="display:inline-block;background:#f4f4f4;color:#0a0a0a;text-decoration:none;padding:10px 18px;border-radius:999px">Verify email</a></p>
    </div>`,
    text: `Verify your SonSoul email: ${url}`,
  }).catch(() => {});
}

// --- Register ----------------------------------------------------------------
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  if (limited(req.ip || 'unknown')) {
    res.status(429).json({ success: false, error: 'Too many attempts — try again later.' });
    return;
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = normalizePassword(String(req.body?.password || ''));
  const name = req.body?.name ? String(req.body.name).trim().slice(0, 120) : null;
  const marketingOptIn = req.body?.marketingOptIn ? 1 : 0;

  if (!EMAIL_RX.test(email) || email.length > 254) {
    res.status(400).json({ success: false, error: 'A valid email is required.', field: 'email' });
    return;
  }
  if (!passwordMeetsPolicy(password)) {
    res.status(400).json({
      success: false,
      error: 'Password must be 8+ chars with upper, lower, a number, and a symbol.',
      field: 'password',
    });
    return;
  }

  const existing = await query<RowDataPacket[]>('SELECT id FROM customers WHERE email = ?', [email]);
  if (existing[0]) {
    res.status(409).json({ success: false, error: 'An account with that email already exists.', field: 'email' });
    return;
  }

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const result = await execute(
    'INSERT INTO customers (email, password_hash, name, marketing_opt_in) VALUES (?, ?, ?, ?)',
    [email, hash, name, marketingOptIn],
  );
  const id = result.insertId;
  await linkGuestOrders(id, email);
  await issueVerifyEmail(id, email, name);

  const rows = await query<CustomerRow[]>('SELECT * FROM customers WHERE id = ?', [id]);
  const token = signCustomerToken({ sub: id, email, pcat: pcatOf(rows[0].password_changed_at) });
  res.status(201).json({ success: true, token, customer: { id, email, name, emailVerified: false } });
});

// --- Login -------------------------------------------------------------------
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  if (limited(req.ip || 'unknown')) {
    res.status(429).json({ success: false, error: 'Too many attempts — try again later.' });
    return;
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = normalizePassword(String(req.body?.password || ''));
  if (password.length > 256) {
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
    return;
  }

  const rows = await query<CustomerRow[]>('SELECT * FROM customers WHERE email = ? AND is_active = 1', [email]);
  const c = rows[0];
  const ok = await bcrypt.compare(password, c?.password_hash ?? DUMMY_HASH);
  if (!c || !ok) {
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
    return;
  }

  await execute('UPDATE customers SET last_login_at = NOW() WHERE id = ?', [c.id]);
  await linkGuestOrders(c.id, c.email);
  const token = signCustomerToken({ sub: c.id, email: c.email, pcat: pcatOf(c.password_changed_at) });
  res.json({
    success: true,
    token,
    customer: { id: c.id, email: c.email, name: c.name, emailVerified: c.email_verified === 1 },
  });
});

// --- Verify email ------------------------------------------------------------
router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
  const raw = String(req.body?.token || '');
  if (!/^[a-f0-9]{64}$/.test(raw)) {
    res.status(400).json({ success: false, error: 'Invalid token.' });
    return;
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT id, customer_id FROM customer_tokens
     WHERE token_hash = ? AND purpose = 'verify' AND used = 0 AND expires_at > NOW()`,
    [hashToken(raw)],
  );
  const t = rows[0];
  if (!t) {
    res.status(410).json({ success: false, error: 'This link is invalid or has expired.' });
    return;
  }
  await execute('UPDATE customer_tokens SET used = 1 WHERE id = ?', [t.id]);
  await execute('UPDATE customers SET email_verified = 1 WHERE id = ?', [t.customer_id]);
  await execute(
    "UPDATE customer_tokens SET used = 1 WHERE customer_id = ? AND purpose = 'verify' AND used = 0",
    [t.customer_id],
  );
  res.json({ success: true });
});

// --- Forgot password (generic response prevents account enumeration) --------
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const generic = { success: true, message: 'If an account exists for that email, a reset link is on its way.' };
  if (limited(req.ip || 'unknown')) {
    res.json(generic);
    return;
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RX.test(email)) {
    res.json(generic);
    return;
  }
  const rows = await query<RowDataPacket[]>('SELECT id, name FROM customers WHERE email = ? AND is_active = 1', [email]);
  const c = rows[0];
  if (c) {
    const raw = crypto.randomBytes(32).toString('hex');
    await execute(
      `INSERT INTO customer_tokens (customer_id, token_hash, purpose, expires_at)
       VALUES (?, ?, 'reset', DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [c.id, hashToken(raw)],
    );
    const url = `${APP_URL()}/reset-password?token=${raw}`;
    void sendEmail({
      to: email,
      subject: 'Reset your SonSoul password',
      html: `<div style="font-family:system-ui,sans-serif;background:#0a0a0a;color:#f4f4f4;padding:24px;border-radius:12px;max-width:520px;margin:auto">
        <h2 style="font-weight:300">Password reset</h2>
        <p style="color:#cfcfcf">Use the link below within 1 hour. If you didn't request this, ignore it.</p>
        <p><a href="${url}" style="display:inline-block;background:#f4f4f4;color:#0a0a0a;text-decoration:none;padding:10px 18px;border-radius:999px">Reset password</a></p>
      </div>`,
      text: `Reset your SonSoul password (valid 1 hour): ${url}`,
    }).catch(() => {});
  } else {
    crypto.randomBytes(32); // keep timing comparable
  }
  res.json(generic);
});

// --- Reset password ----------------------------------------------------------
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const raw = String(req.body?.token || '');
  const newPassword = normalizePassword(String(req.body?.newPassword || ''));
  if (!/^[a-f0-9]{64}$/.test(raw)) {
    res.status(400).json({ success: false, error: 'Invalid token.' });
    return;
  }
  if (!passwordMeetsPolicy(newPassword)) {
    res.status(400).json({ success: false, error: 'Password does not meet requirements.', field: 'newPassword' });
    return;
  }
  const rows = await query<RowDataPacket[]>(
    `SELECT id, customer_id FROM customer_tokens
     WHERE token_hash = ? AND purpose = 'reset' AND used = 0 AND expires_at > NOW()`,
    [hashToken(raw)],
  );
  const t = rows[0];
  if (!t) {
    res.status(410).json({ success: false, error: 'This link is invalid or has expired.' });
    return;
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  // password_changed_at bump invalidates every existing JWT for this account.
  await execute('UPDATE customers SET password_hash = ?, password_changed_at = NOW() WHERE id = ?', [
    hash,
    t.customer_id,
  ]);
  await execute("UPDATE customer_tokens SET used = 1 WHERE customer_id = ? AND purpose = 'reset' AND used = 0", [
    t.customer_id,
  ]);
  res.json({ success: true });
});

// --- Me ----------------------------------------------------------------------
router.get('/me', requireCustomer, async (req: Request, res: Response): Promise<void> => {
  const rows = await query<CustomerRow[]>(
    'SELECT id, email, name, email_verified, marketing_opt_in FROM customers WHERE id = ?',
    [req.customer!.id],
  );
  res.json({ success: true, customer: rows[0] });
});

// --- Order history -----------------------------------------------------------
router.get('/orders', requireCustomer, async (req: Request, res: Response): Promise<void> => {
  const orders = await query<RowDataPacket[]>(
    `SELECT id, order_number, status, total_cents, currency, created_at
     FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100`,
    [req.customer!.id],
  );
  for (const o of orders) {
    o.items = await query<RowDataPacket[]>(
      'SELECT title_snapshot, unit_price_cents, quantity, license_tier, is_digital FROM order_items WHERE order_id = ?',
      [o.id],
    );
  }
  res.json({ success: true, orders });
});

// --- Active downloads (re-download library) ---------------------------------
router.get('/downloads', requireCustomer, async (req: Request, res: Response): Promise<void> => {
  const rows = await query<RowDataPacket[]>(
    `SELECT dg.token, dg.expires_at, dg.download_count, dg.max_downloads, oi.title_snapshot, o.order_number
     FROM download_grants dg
     JOIN order_items oi ON oi.id = dg.order_item_id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.customer_id = ? AND o.status IN ('paid','fulfilled') AND dg.expires_at > NOW()
     ORDER BY dg.created_at DESC`,
    [req.customer!.id],
  );
  const downloads = rows.map((r) => ({
    title: r.title_snapshot,
    orderNumber: r.order_number,
    url: `${APP_URL()}/api/store/download/${r.token}`,
    expiresAt: r.expires_at,
    remaining: Math.max(0, Number(r.max_downloads) - Number(r.download_count)),
  }))
  res.json({ success: true, downloads })
})

export default router;
