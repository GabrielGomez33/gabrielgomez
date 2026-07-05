import crypto from 'crypto';

// =============================================================================
// Short-lived, HMAC-signed preview tokens. Minted by the catalog API per track,
// verified by the stream endpoint — so preview URLs can't be hotlinked or
// bulk-scraped, and they expire quickly.
// =============================================================================

function secret(): string {
  return process.env.MEDIA_TOKEN_SECRET || process.env.JWT_SECRET || '';
}

const TTL = Number(process.env.PREVIEW_TOKEN_TTL_SECONDS || 300);

export function signPreviewToken(trackId: number): string {
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const sig = crypto.createHmac('sha256', secret()).update(`${trackId}.${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

export function verifyPreviewToken(trackId: number, token: string | undefined): boolean {
  if (!token || !secret()) return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!exp || exp < Math.floor(Date.now() / 1000) || !sig) return false;
  const expected = crypto.createHmac('sha256', secret()).update(`${trackId}.${exp}`).digest('base64url');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// --- Cover tokens ------------------------------------------------------------
// Let the admin UI preview a still-unpublished product's cover with a plain
// <img> tag (which can't send an auth header) without exposing draft covers to
// public id-enumeration. Longer TTL than previews since a cover is low-risk.
const COVER_TTL = Number(process.env.COVER_TOKEN_TTL_SECONDS || 3600);

export function signCoverToken(productId: number): string {
  const exp = Math.floor(Date.now() / 1000) + COVER_TTL;
  const sig = crypto.createHmac('sha256', secret()).update(`cover.${productId}.${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

export function verifyCoverToken(productId: number, token: string | undefined): boolean {
  if (!token || !secret()) return false;
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!exp || exp < Math.floor(Date.now() / 1000) || !sig) return false;
  const expected = crypto.createHmac('sha256', secret()).update(`cover.${productId}.${exp}`).digest('base64url');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
