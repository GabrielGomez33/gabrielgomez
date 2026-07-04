import express, { type Request, type Response } from 'express';
import { sendEmail, escapeHtml } from '../services/emailService';

// =============================================================================
// Public contact / inquiry endpoint. Emulates mirror-server's feedback flow
// (operator-inbox email + user acknowledgement, HTML-escaped templates,
// sliding-window rate limit) but for an UNAUTHENTICATED audience — so it gates
// abuse with a honeypot field + per-IP rate limiting instead of a JWT.
// =============================================================================

const router = express.Router();

const MAX_NAME = 100;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;
const MAX_EMAIL = 254;
const MIN_MESSAGE = 5;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Read at call time (see emailService) so import order can't strand these.
const supportInbox = () => process.env.SUPPORT_INBOX_EMAIL || 'theanimaprojectllc@gmail.com';
const appUrl = () => process.env.APP_URL || 'https://www.theundergroundrailroad.world/GabrielGomez';

// Sliding-window rate limit, keyed by truncated IP, held in memory (process
// local — same approach as mirror-server's feedback limiter).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = Math.max(1, parseInt(process.env.CONTACT_RATE_LIMIT || '5', 10));
const windows = new Map<string, { count: number; start: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) {
    if (now - w.start > WINDOW_MS) windows.delete(key);
  }
}, WINDOW_MS).unref();

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function truncateIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':'); // IPv6 → /48-ish
  return ip.split('.').slice(0, 3).join('.') + '.0'; // IPv4 → /24
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Honeypot: bots fill hidden fields. Pretend success and drop silently.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    res.status(200).json({ success: true, data: { message: 'Thanks — your message was received.' } });
    return;
  }

  const name = clip(body.name, MAX_NAME);
  const email = clip(body.email, MAX_EMAIL).toLowerCase();
  const subject = clip(body.subject, MAX_SUBJECT);
  const message = clip(body.message, MAX_MESSAGE);

  const errors: string[] = [];
  if (!name) errors.push('Name is required.');
  if (!EMAIL_RX.test(email)) errors.push('A valid email is required.');
  if (!subject) errors.push('A subject is required.');
  if (message.length < MIN_MESSAGE) errors.push('Please add a bit more detail (at least 5 characters).');
  if (errors.length) {
    res.status(400).json({ success: false, error: errors.join(' '), code: 'INVALID' });
    return;
  }

  // Rate limit.
  const key = truncateIp(req.ip);
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start > WINDOW_MS) {
    windows.set(key, { count: 1, start: now });
  } else if (w.count >= MAX_PER_WINDOW) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - w.start)) / 1000);
    res.status(429).json({
      success: false,
      error: 'Too many messages — please wait a little while and try again.',
      code: 'RATE_LIMITED',
      retryAfterSec,
    });
    return;
  } else {
    w.count += 1;
  }

  // Operator inbox email — awaited so we report a real success/failure.
  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email),
    subject: escapeHtml(subject),
    message: escapeHtml(message).replace(/\n/g, '<br>'),
  };
  const operatorHtml = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0a0a0a;color:#f4f4f4;padding:28px;border-radius:14px;max-width:640px;margin:auto">
      <p style="letter-spacing:.28em;font-size:11px;color:#9a9a9a;text-transform:uppercase;margin:0 0 14px">New portfolio inquiry</p>
      <h2 style="font-weight:300;margin:0 0 18px">${safe.subject}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#cfcfcf">
        <tr><td style="padding:4px 0;color:#9a9a9a;width:90px">From</td><td>${safe.name}</td></tr>
        <tr><td style="padding:4px 0;color:#9a9a9a">Reply-to</td><td>${safe.email}</td></tr>
      </table>
      <div style="margin-top:18px;padding-top:18px;border-top:1px solid #2a2a2a;white-space:pre-wrap;line-height:1.6">${safe.message}</div>
    </div>`;
  const operatorText = `New portfolio inquiry\nFrom: ${name} <${email}>\nSubject: ${subject}\n\n${message}`;

  const op = await sendEmail({
    to: supportInbox(),
    subject: `[Portfolio] ${subject} — ${name}`,
    html: operatorHtml,
    text: operatorText,
    replyTo: email,
  });

  if (!op.ok) {
    console.error('[contact] operator email failed:', op.error);
    res.status(502).json({
      success: false,
      error: 'Sorry — the message could not be sent right now. Please try again shortly.',
      code: 'SEND_FAILED',
    });
    return;
  }

  // User acknowledgement — fire-and-forget, never blocks the response.
  const ackHtml = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0a0a0a;color:#f4f4f4;padding:28px;border-radius:14px;max-width:560px;margin:auto">
      <h2 style="font-weight:300;margin:0 0 14px">Thanks, ${safe.name} &mdash; I got your message.</h2>
      <p style="color:#cfcfcf;line-height:1.6;margin:0 0 18px">I&rsquo;ll get back to you soon. You can reply directly to this email if you&rsquo;d like to add anything.</p>
      <a href="${appUrl()}/" style="display:inline-block;background:#f4f4f4;color:#0a0a0a;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:13px;letter-spacing:.08em">Back to the site</a>
    </div>`;
  void sendEmail({
    to: email,
    subject: 'Thanks — I got your message',
    html: ackHtml,
    text: `Hi ${name},\n\nThanks for reaching out — I got your message and will get back to you soon.\n\n— Gabriel`,
    replyTo: supportInbox(),
  }).catch(() => {
    /* ack is best-effort */
  });

  res.status(201).json({ success: true, data: { message: 'Thanks — your message was received.' } });
});

export default router;
