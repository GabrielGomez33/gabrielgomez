import express, { type Request, type Response } from 'express';
import fs from 'fs';
import { getProductById, getTrackById } from '../../services/products';
import { resolveInStorage, spawnPreviewTranscode } from '../../services/media';
import { verifyPreviewToken } from '../../services/previewToken';

// =============================================================================
// Secure preview streaming. Never exposes a file path; serves ONLY the 10s
// tagged preview, gated by a short-lived HMAC token + origin check + per-IP
// rate limit. Uses the cached preview (with Range support) when present, else
// an on-the-fly ffmpeg transcode so the master is never at a reachable path.
// =============================================================================

const router = express.Router();

// Per-IP rate limit (in-memory sliding window).
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = Number(process.env.PREVIEW_RATE_LIMIT || 60);
const hits = new Map<string, { count: number; start: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of hits) if (now - w.start > WINDOW_MS) hits.delete(k);
}, WINDOW_MS).unref();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const w = hits.get(ip);
  if (!w || now - w.start > WINDOW_MS) {
    hits.set(ip, { count: 1, start: now });
    return false;
  }
  if (w.count >= MAX_PER_WINDOW) return true;
  w.count += 1;
  return false;
}

function originAllowed(req: Request): boolean {
  const allowed = process.env.PREVIEW_ALLOWED_ORIGIN;
  if (!allowed) return true; // not configured → don't block (dev-friendly)
  const origin = req.get('origin') || req.get('referer') || '';
  return origin.startsWith(allowed);
}

router.get('/preview/:trackId', async (req: Request, res: Response): Promise<void> => {
  const trackId = Number(req.params.trackId);
  if (!Number.isInteger(trackId) || trackId <= 0) {
    res.status(400).end();
    return;
  }
  if (!verifyPreviewToken(trackId, req.query.t as string | undefined)) {
    res.status(403).json({ success: false, error: 'Invalid or expired preview token.' });
    return;
  }
  if (!originAllowed(req)) {
    res.status(403).end();
    return;
  }
  if (rateLimited(req.ip || 'unknown')) {
    res.status(429).end();
    return;
  }

  const track = await getTrackById(trackId);
  if (!track) {
    res.status(404).end();
    return;
  }
  // Only stream previews for published products.
  const product = await getProductById(track.product_id);
  if (!product || product.status !== 'published') {
    res.status(404).end();
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prefer the cached tagged preview (supports Range for scrubbing).
  if (track.preview_path) {
    let absPreview: string;
    try {
      absPreview = resolveInStorage(track.preview_path);
    } catch {
      res.status(404).end();
      return;
    }
    if (fs.existsSync(absPreview)) {
      const size = fs.statSync(absPreview).size;
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range);
        const start = m ? Number(m[1]) : 0;
        const end = m && m[2] ? Number(m[2]) : size - 1;
        if (start >= size || end >= size) {
          res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', end - start + 1);
        fs.createReadStream(absPreview, { start, end }).pipe(res);
        return;
      }
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', size);
      fs.createReadStream(absPreview).pipe(res);
      return;
    }
  }

  // Fallback: on-the-fly transcode from the master (never exposes its path).
  if (track.master_path) {
    let absMaster: string;
    try {
      absMaster = resolveInStorage(track.master_path);
    } catch {
      res.status(404).end();
      return;
    }
    if (fs.existsSync(absMaster)) {
      const proc = spawnPreviewTranscode(absMaster);
      proc.stdout.pipe(res);
      proc.on('error', () => {
        if (!res.headersSent) res.status(500).end();
      });
      req.on('close', () => proc.kill('SIGKILL'));
      return;
    }
  }

  res.status(404).end();
});

export default router;
