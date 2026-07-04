import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { query } from './db/pool';

// =============================================================================
// Backend self-check — validates configuration + dependencies at boot and via
// GET /admin/system. Catches the common misconfigurations (wrong APP_URL,
// missing secrets, unwritable storage, ffmpeg not found, DB unreachable).
// =============================================================================

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
export interface CheckReport {
  ok: boolean;
  checks: Check[];
  time: string;
}

function bin(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, ['-version'], { stdio: 'ignore' });
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
      setTimeout(() => {
        p.kill('SIGKILL');
        resolve(false);
      }, 4000).unref();
    } catch {
      resolve(false);
    }
  });
}

export async function runSelfCheck(): Promise<CheckReport> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  // Secrets
  add('JWT_SECRET', Boolean(process.env.JWT_SECRET), process.env.JWT_SECRET ? 'set' : 'MISSING — auth will fail');
  const mediaSecret = process.env.MEDIA_TOKEN_SECRET || process.env.JWT_SECRET;
  add('media token secret', Boolean(mediaSecret), process.env.MEDIA_TOKEN_SECRET ? 'set (distinct)' : mediaSecret ? 'falling back to JWT_SECRET' : 'MISSING');

  // APP_URL sanity — must point at this app's base path.
  const appUrl = process.env.APP_URL || '';
  const appUrlOk = appUrl.includes('/GabrielGomez');
  add('APP_URL', appUrlOk, appUrlOk ? appUrl : `WRONG or unset (got "${appUrl}") — must include /GabrielGomez`);

  // Email
  add('email (Resend)', Boolean(process.env.RESEND_API_KEY), process.env.RESEND_API_KEY ? `configured (dry_run=${process.env.EMAIL_DRY_RUN || 'false'})` : 'RESEND_API_KEY missing');

  // PayPal
  const ppOk = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  add('PayPal', ppOk, ppOk ? `${(process.env.PAYPAL_ENV || 'sandbox')}${process.env.PAYPAL_WEBHOOK_ID ? ' + webhook' : ' (no webhook id)'}` : 'client id/secret missing');

  // Database
  try {
    await query('SELECT 1');
    add('database', true, 'reachable');
  } catch (err) {
    add('database', false, `unreachable: ${err instanceof Error ? err.message : err}`);
  }

  // Storage (must exist + be writable)
  const storage = process.env.STORAGE_ROOT || '/var/www/GabrielGomez-storage';
  try {
    fs.accessSync(storage, fs.constants.W_OK);
    add('storage', true, `${storage} writable`);
  } catch {
    add('storage', false, `${storage} missing or not writable`);
  }

  // Producer tag (optional)
  const tag = process.env.PRODUCER_TAG_PATH;
  if (tag) add('producer tag', fs.existsSync(tag), fs.existsSync(tag) ? path.basename(tag) : `not found: ${tag}`);

  // ffmpeg / ffprobe
  const [ff, fp] = await Promise.all([
    bin(process.env.FFMPEG_PATH || 'ffmpeg'),
    bin(process.env.FFPROBE_PATH || 'ffprobe'),
  ]);
  add('ffmpeg', ff, ff ? 'available' : 'NOT found — previews/waveforms will fail');
  add('ffprobe', fp, fp ? 'available' : 'NOT found — track metadata will be empty');

  return { ok: checks.every((c) => c.ok), checks, time: new Date().toISOString() };
}

/** Log a compact one-line-per-check report at boot. */
export async function logSelfCheck(): Promise<void> {
  try {
    const report = await runSelfCheck();
    console.log(`[selfcheck] ${report.ok ? 'ALL OK' : 'ISSUES FOUND'}:`);
    for (const c of report.checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  } catch (err) {
    console.error('[selfcheck] failed to run:', err instanceof Error ? err.message : err);
  }
}
