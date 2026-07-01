// =============================================================================
// Email service — Resend provider via REST (no SDK), mirroring mirror-server's
// emailService. Reads all config from the environment; the API key never lives
// in the repo.
// =============================================================================

const PROVIDER = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
const API_KEY = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '';
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'noreply@theundergroundrailroad.world';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Gabriel Gomez';

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Send a single transactional email through Resend. */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  if (!API_KEY) {
    return { ok: false, error: 'email not configured (missing RESEND_API_KEY)' };
  }
  if (PROVIDER !== 'resend') {
    return { ok: false, error: `unsupported EMAIL_PROVIDER: ${PROVIDER}` };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_ADDRESS}>`,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {}),
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `resend ${response.status}: ${body.slice(0, 300)}` };
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Escape user-supplied text before interpolating into an HTML email. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
