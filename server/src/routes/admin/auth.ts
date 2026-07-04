import express, { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { type RowDataPacket } from 'mysql2/promise';
import { query, execute } from '../../db/pool';
import { signAdminToken } from '../../auth/tokens';
import { requireAdmin } from '../../auth/middleware';

const router = express.Router();

interface AdminRow extends RowDataPacket {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  is_active: number;
}

// A fixed dummy hash keeps login timing constant whether or not the user exists.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Dj0PjV6cU9y1Q3wY3Ff3B6P2mYia';

// Per-IP login rate limit (brute-force defense), in-memory sliding window.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = Number(process.env.LOGIN_RATE_LIMIT || 10);
const loginHits = new Map<string, { count: number; start: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of loginHits) if (now - w.start > LOGIN_WINDOW_MS) loginHits.delete(k);
}, LOGIN_WINDOW_MS).unref();

function loginRateLimited(ip: string): boolean {
  const now = Date.now();
  const w = loginHits.get(ip);
  if (!w || now - w.start > LOGIN_WINDOW_MS) {
    loginHits.set(ip, { count: 1, start: now });
    return false;
  }
  if (w.count >= LOGIN_MAX) return true;
  w.count += 1;
  return false;
}

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  if (loginRateLimited(req.ip || 'unknown')) {
    res.status(429).json({ success: false, error: 'Too many attempts — try again later.' });
    return;
  }
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) {
    res.status(400).json({ success: false, error: 'Username and password are required.' });
    return;
  }

  const rows = await query<AdminRow[]>(
    'SELECT * FROM admin_users WHERE (username = ? OR email = ?) AND is_active = 1 LIMIT 1',
    [username, username],
  );
  const admin = rows[0];
  const ok = await bcrypt.compare(password, admin?.password_hash ?? DUMMY_HASH);

  if (!admin || !ok) {
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
    return;
  }

  await execute('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [admin.id]);
  const token = signAdminToken({ sub: admin.id, username: admin.username, role: 'admin' });
  res.json({ success: true, token, admin: { id: admin.id, username: admin.username, email: admin.email } });
});

// Cheap way for the client to validate a stored token on load.
router.get('/me', requireAdmin, (req: Request, res: Response) => {
  res.json({ success: true, admin: req.admin });
});

export default router;
