import express, { type Request, type Response } from 'express';
import { requireAdmin } from '../../auth/middleware';
import * as products from '../../services/products';
import { createCatalogProduct, isPayPalConfigured } from '../../services/paypal';
import { signCoverToken } from '../../services/previewToken';

const router = express.Router();
router.use(requireAdmin); // everything here is admin-only

const CATEGORIES = new Set(['music', 'clothing', 'accessory']);
const API_BASE = '/GabrielGomez/api';

// Attach cover URLs carrying a short-lived token, so the admin UI can preview a
// draft product's cover with a plain <img> (which can't send an auth header).
function withCover<T extends { id: number; cover_image_path?: string | null; cover_thumb_path?: string | null }>(
  row: T,
): T & { coverUrl: string | null; coverThumbUrl: string | null } {
  const ct = signCoverToken(row.id);
  return {
    ...row,
    coverUrl: row.cover_image_path ? `${API_BASE}/store/cover/${row.id}?ct=${ct}` : null,
    coverThumbUrl: row.cover_thumb_path
      ? `${API_BASE}/store/cover/${row.id}?size=thumb&ct=${ct}`
      : row.cover_image_path
        ? `${API_BASE}/store/cover/${row.id}?ct=${ct}`
        : null,
  };
}

// Create a product (metadata; media upload comes via a later endpoint).
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const b = req.body ?? {};
  if (!CATEGORIES.has(b.category)) {
    res.status(400).json({ success: false, error: 'category must be music | clothing | accessory.' });
    return;
  }
  if (typeof b.type !== 'string' || !b.type.trim()) {
    res.status(400).json({ success: false, error: 'type is required.' });
    return;
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  if (!str(b.title)) {
    res.status(400).json({ success: false, error: 'Title is required.', field: 'title' });
    return;
  }
  if (!str(b.subtitle)) {
    res.status(400).json({ success: false, error: 'Subtitle is required.', field: 'subtitle' });
    return;
  }
  if (!str(b.description)) {
    res.status(400).json({ success: false, error: 'Description is required.', field: 'description' });
    return;
  }
  const priceCents = Math.round(Number(b.priceCents) || 0);
  if (priceCents <= 0) {
    res.status(400).json({ success: false, error: 'Price must be greater than 0.', field: 'price' });
    return;
  }
  if (b.category === 'music') {
    if (!str(b.genre)) {
      res.status(400).json({ success: false, error: 'Genre is required.', field: 'genre' });
      return;
    }
    if (!str(b.style)) {
      res.status(400).json({ success: false, error: 'Style is required.', field: 'style' });
      return;
    }
  }
  const id = await products.createProduct({
    category: b.category,
    type: String(b.type).trim(),
    title: String(b.title).trim(),
    subtitle: str(b.subtitle),
    description: str(b.description),
    priceCents,
    currency: b.currency,
    weightGrams: b.weightGrams ?? null,
  });
  // Music products get their universal genre/style/notes recorded up front.
  if (b.category === 'music' && (b.genre || b.style || b.notes)) {
    await products.setMusicMeta(id, { genre: b.genre ?? null, style: b.style ?? null, notes: b.notes ?? null });
  }
  const row = await products.getProductById(id);
  res.status(201).json({ success: true, product: row ? await products.getFullProduct(row) : null });
});

// List (all statuses).
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const category = req.query.category as products.Category | undefined;
  const status = req.query.status as products.Status | undefined;
  const rows = await products.listProducts({ category, status });
  res.json({ success: true, products: rows.map(withCover) });
});

// Detail with related rows.
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const row = await products.getProductById(Number(req.params.id));
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  res.json({ success: true, product: withCover(await products.getFullProduct(row)) });
});

// Update basic fields.
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const existing = await products.getProductById(id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  await products.updateProduct(id, req.body ?? {});
  res.json({ success: true, product: await products.getProductById(id) });
});

// Add a track (music).
router.post('/:id/tracks', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const existing = await products.getProductById(id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  if (typeof req.body?.name !== 'string' || !req.body.name.trim()) {
    res.status(400).json({ success: false, error: 'Track name is required.' });
    return;
  }
  const trackId = await products.addTrack(id, {
    name: String(req.body.name).trim(),
    artist: req.body.artist ?? null,
    genre: req.body.genre ?? null,
    style: req.body.style ?? null,
    lengthSec: req.body.lengthSec ?? null,
    bpm: req.body.bpm ?? null,
    musicKey: req.body.musicKey ?? null,
    position: req.body.position ?? 0,
    // Technical fields are normally auto-filled by the upload pipeline (ffprobe).
    fileSizeBytes: req.body.fileSizeBytes ?? null,
    format: req.body.format ?? null,
    bitrateKbps: req.body.bitrateKbps ?? null,
    sampleRate: req.body.sampleRate ?? null,
    channels: req.body.channels ?? null,
    originalFilename: req.body.originalFilename ?? null,
  });
  res.status(201).json({ success: true, trackId });
});

// Add a variant (clothing/accessory).
router.post('/:id/variants', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const existing = await products.getProductById(id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  const variantId = await products.addVariant(id, req.body ?? {});
  res.status(201).json({ success: true, variantId });
});

// Add / upsert a music license tier.
router.post('/:id/tiers', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const existing = await products.getProductById(id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  const tier = req.body?.tier as products.LicenseTier;
  if (!['mp3', 'wav', 'stems', 'unlimited', 'exclusive'].includes(tier)) {
    res.status(400).json({ success: false, error: 'tier must be wav | stems | unlimited | exclusive.' });
    return;
  }
  await products.addLicenseTier(id, tier, Number(req.body?.priceCents) || 0);
  res.status(201).json({ success: true });
});

// Upsert product-level music metadata (genre / style / notes).
router.post('/:id/music-meta', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const existing = await products.getProductById(id);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  const style = req.body?.style;
  if (style && !['vocal', 'instruments', 'mixed'].includes(style)) {
    res.status(400).json({ success: false, error: 'style must be vocal | instruments | mixed.' });
    return;
  }
  await products.setMusicMeta(id, {
    genre: req.body?.genre ?? null,
    style: style ?? null,
    notes: req.body?.notes ?? null,
  });
  res.json({ success: true, musicMeta: await products.getMusicMeta(id) });
});

// Publish: flips status and auto-creates the PayPal catalog product.
router.post('/:id/publish', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const row = await products.getProductById(id);
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }

  // Completeness gate — a product can't go live with missing fields/content.
  const full = await products.getFullProduct(row);
  const missing: string[] = [];
  if (!row.title?.trim()) missing.push('title');
  if (!row.subtitle?.trim()) missing.push('subtitle');
  if (!row.description?.trim()) missing.push('description');
  if (!(row.price_cents > 0)) missing.push('price');
  if (!row.cover_image_path) missing.push('cover image');
  if (row.category === 'music') {
    const mm = full.musicMeta as { genre?: string; style?: string } | null;
    if (!mm?.genre) missing.push('genre');
    if (!mm?.style) missing.push('style');
    const tracks = full.tracks as Array<{ is_preview?: number }>;
    if (tracks.length === 0) {
      missing.push(row.type === 'samplepack' ? 'at least one sample' : 'at least one track');
    } else if (row.type === 'samplepack' && !tracks.some((t) => t.is_preview)) {
      missing.push('at least one preview sample (use Auto-pick previews)');
    }
  } else if ((full.variants as unknown[]).length === 0) {
    missing.push('at least one variant');
  }
  if (missing.length > 0) {
    res.status(400).json({
      success: false,
      error: `Cannot publish — complete these first: ${missing.join(', ')}.`,
      missing,
    });
    return;
  }

  let paypalWarning: string | undefined;
  if (!row.paypal_product_id && isPayPalConfigured()) {
    try {
      const appBase = process.env.APP_URL || 'https://www.theundergroundrailroad.world/GabrielGomez';
      const pp = await createCatalogProduct({
        name: row.title.slice(0, 127),
        // Use || (not ??) so an empty-string description falls back — PayPal 400s on "".
        description: (row.description || row.subtitle || row.title || 'SonSoul').slice(0, 256),
        type: row.is_digital ? 'DIGITAL' : 'PHYSICAL',
        homeUrl: `${appBase}/store/${row.slug}`,
        requestId: `sonsoul-product-${row.id}`,
      });
      await products.setPayPalProductId(id, pp.id);
    } catch (err) {
      paypalWarning = err instanceof Error ? err.message : String(err);
      console.error('[admin/products] PayPal catalog create failed:', paypalWarning);
    }
  } else if (!isPayPalConfigured()) {
    paypalWarning = 'PayPal not configured — published without a PayPal catalog product.';
  }

  await products.setStatus(id, 'published');
  res.json({ success: true, product: await products.getProductById(id), paypalWarning });
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  await products.deleteProduct(Number(req.params.id));
  res.json({ success: true });
});

export default router;
