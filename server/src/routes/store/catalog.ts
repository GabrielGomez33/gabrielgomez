import express, { type Request, type Response } from 'express';
import fs from 'fs';
import { type RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool';
import * as products from '../../services/products';
import { signPreviewToken, verifyCoverToken } from '../../services/previewToken';
import { resolveInStorage } from '../../services/media';

// Public storefront catalog (published products only). No auth.
const router = express.Router();

const API_BASE = '/GabrielGomez/api';

// A cache-busting version token from the product's updated_at. The public cover
// URL is keyed only by product id (the file is always cover.webp), so without
// this a re-uploaded cover keeps the same URL and browsers / the PWA service
// worker keep serving the cached image. updated_at bumps on every product
// update (incl. cover upload), so the token changes exactly when it should.
export function coverVersion(updatedAt: unknown): string {
  if (updatedAt instanceof Date) return String(updatedAt.getTime());
  const s = String(updatedAt ?? '');
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isFinite(t) ? String(t) : s.replace(/\D/g, '');
}
function coverUrl(row: { id: number; cover_image_path: string | null; updated_at?: unknown }): string | null {
  return row.cover_image_path ? `${API_BASE}/store/cover/${row.id}?v=${coverVersion(row.updated_at)}` : null;
}
function coverThumbUrl(row: { id: number; cover_thumb_path: string | null; updated_at?: unknown }): string | null {
  return row.cover_thumb_path ? `${API_BASE}/store/cover/${row.id}?size=thumb&v=${coverVersion(row.updated_at)}` : null;
}

// Strip internal file paths from a track and attach a signed preview URL so the
// browser can only reach the 10s preview through the gated stream endpoint.
function publicizeTrack(track: RowDataPacket): Record<string, unknown> {
  const { master_path, preview_path, ...safe } = track;
  void master_path;
  const hasPreview = Boolean(preview_path || track.master_path);
  return {
    ...safe,
    previewUrl: hasPreview ? `${API_BASE}/store/preview/${track.id}?t=${signPreviewToken(track.id)}` : null,
  };
}

async function publicizeProduct(row: products.ProductRow): Promise<Record<string, unknown>> {
  const full = await products.getFullProduct(row);
  const tracks = (full.tracks as RowDataPacket[]).map(publicizeTrack);
  const base = { ...full, coverUrl: coverUrl(row), tracks };

  // Sample packs: surface the curated preview set separately and a summary of
  // what's inside (counts by group, one-shot/loop split, BPM range), so the
  // storefront can show an auditioner + a full manifest without exposing masters.
  if (row.type === 'samplepack') {
    const previewTracks = tracks.filter((t) => (t as { is_preview?: number }).is_preview && (t as { previewUrl?: string }).previewUrl);
    const byGroup: Record<string, number> = {};
    let oneShots = 0;
    let loops = 0;
    let bpmMin: number | null = null;
    let bpmMax: number | null = null;
    for (const t of full.tracks as RowDataPacket[]) {
      const g = (t.sample_group as string) || 'other';
      byGroup[g] = (byGroup[g] || 0) + 1;
      if (t.kind === 'one_shot') oneShots++;
      else if (t.kind === 'loop') loops++;
      if (t.bpm) {
        bpmMin = bpmMin == null ? t.bpm : Math.min(bpmMin, t.bpm);
        bpmMax = bpmMax == null ? t.bpm : Math.max(bpmMax, t.bpm);
      }
    }
    return {
      ...base,
      previewTracks,
      sampleSummary: { total: (full.tracks as unknown[]).length, oneShots, loops, byGroup, bpmMin, bpmMax },
    };
  }
  return base;
}

// Public storefront config (publishable values only — no secrets).
router.get('/config', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
    paypalEnv: (process.env.PAYPAL_ENV || 'sandbox').toLowerCase(),
    currency: 'USD',
    shipping: {
      flatCents: Number(process.env.SHIPPING_FLAT_CENTS || 700),
      perItemCents: Number(process.env.SHIPPING_PER_ITEM_CENTS || 200),
    },
  });
});

// Dropdown options for storefront filters.
router.get('/options', async (req: Request, res: Response): Promise<void> => {
  const kind = req.query.kind as string | undefined;
  const rows = kind
    ? await query<RowDataPacket[]>(
        'SELECT kind, value, label FROM attribute_options WHERE kind = ? AND is_active = 1 ORDER BY sort_order, label',
        [kind],
      )
    : await query<RowDataPacket[]>(
        'SELECT kind, value, label FROM attribute_options WHERE is_active = 1 ORDER BY kind, sort_order, label',
      );
  res.json({ success: true, options: rows });
});

// List published products (optionally by category).
router.get('/products', async (req: Request, res: Response): Promise<void> => {
  const category = req.query.category as products.Category | undefined;
  const rows = await products.listProducts({ category, status: 'published' });
  // Attach genre/style/track_count for music rows so the storefront can group
  // and filter by them (one batched query, no N+1).
  const musicIds = rows.filter((r) => r.category === 'music').map((r) => r.id);
  const meta = await products.getMusicMetaForProducts(musicIds);
  res.json({
    success: true,
    products: rows.map((r) => {
      const mm = meta.get(r.id);
      return {
        ...r,
        coverUrl: coverUrl(r),
        coverThumbUrl: coverThumbUrl(r),
        genre: mm?.genre ?? null,
        style: mm?.style ?? null,
        trackCount: mm?.trackCount ?? 0,
      };
    }),
  });
});

// Cover image. Published covers are public; a draft cover is served only with a
// valid short-lived cover token (used by the admin UI). `?size=thumb` returns the
// square thumbnail, falling back to the full cover if no thumb exists yet.
router.get('/cover/:productId', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.productId);
  const p = await products.getProductById(id);
  if (!p || !p.cover_image_path) {
    res.status(404).end();
    return;
  }
  const allowed = p.status === 'published' || verifyCoverToken(id, req.query.ct as string | undefined);
  if (!allowed) {
    res.status(404).end();
    return;
  }
  const wantThumb = req.query.size === 'thumb';
  const rel = wantThumb && p.cover_thumb_path ? p.cover_thumb_path : p.cover_image_path;
  let abs: string;
  try {
    abs = resolveInStorage(rel);
  } catch {
    res.status(404).end();
    return;
  }
  if (!fs.existsSync(abs)) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(abs);
});

// Published product detail by slug (with tracks/variants/tiers/images).
router.get('/products/:slug', async (req: Request, res: Response): Promise<void> => {
  const row = await products.getProductBySlug(String(req.params.slug));
  if (!row || row.status !== 'published') {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  res.json({ success: true, product: await publicizeProduct(row) });
});

export default router;
