// =============================================================================
// Email service — Resend provider via REST (no SDK), mirroring mirror-server's
// emailService. Reads all config from the environment; the API key never lives
// in the repo.
// =============================================================================

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
  // Read config at call time so it never depends on module import order.
  const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  const apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY || '';
  const fromAddress = process.env.EMAIL_FROM_ADDRESS || 'noreply@theundergroundrailroad.world';
  const fromName = process.env.EMAIL_FROM_NAME || 'Gabriel Gomez';

  if (!apiKey) {
    return { ok: false, error: 'email not configured (missing RESEND_API_KEY)' };
  }
  if (provider !== 'resend') {
    return { ok: false, error: `unsupported EMAIL_PROVIDER: ${provider}` };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
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

// =============================================================================
// Email layout — a full, well-formed HTML document (preheader + header + card +
// footer, table-based for client compatibility). Bare <div> fragments score
// poorly with spam filters; this matches the structure of proven senders.
// =============================================================================
export interface EmailLayoutOpts {
  heading: string;
  intro?: string;
  bodyHtml?: string;
  button?: { text: string; url: string };
  footerNote?: string;
}

export function renderEmail(opts: EmailLayoutOpts): string {
  const brand = process.env.EMAIL_FROM_NAME || 'SonSoul';
  const preheader = opts.intro || opts.heading;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${brand}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0a0a0a;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111111;border:1px solid #2a2a2a;border-radius:14px;">
      <tr><td style="padding:26px 28px 4px;font-family:Arial,Helvetica,sans-serif;">
        <p style="margin:0;font-size:12px;letter-spacing:3px;color:#9a9a9a;text-transform:uppercase;">${brand}</p>
      </td></tr>
      <tr><td style="padding:8px 28px;font-family:Arial,Helvetica,sans-serif;color:#f4f4f4;">
        <h1 style="margin:0 0 12px;font-weight:300;font-size:24px;line-height:1.25;">${opts.heading}</h1>
        ${opts.intro ? `<p style="margin:0 0 16px;color:#cfcfcf;line-height:1.6;font-size:15px;">${opts.intro}</p>` : ''}
        ${opts.bodyHtml || ''}
        ${
          opts.button
            ? `<p style="margin:22px 0 8px;"><a href="${opts.button.url}" style="display:inline-block;background:#f4f4f4;color:#0a0a0a;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:bold;">${opts.button.text}</a></p>
        <p style="margin:0;color:#8a8a8a;font-size:12px;word-break:break-all;">Or paste this link into your browser:<br>${opts.button.url}</p>`
            : ''
        }
      </td></tr>
      <tr><td style="padding:22px 28px 26px;font-family:Arial,Helvetica,sans-serif;">
        <hr style="border:none;border-top:1px solid #2a2a2a;margin:0 0 14px;">
        <p style="margin:0;color:#7a7a7a;font-size:12px;line-height:1.5;">${
          opts.footerNote || `Sent by ${brand} · theundergroundrailroad.world`
        }</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
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
