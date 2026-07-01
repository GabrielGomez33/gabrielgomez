import express, { type Request, type Response } from 'express';
import { requireAdmin } from '../../auth/middleware';
import * as products from '../../services/products';
import { createCatalogProduct, isPayPalConfigured } from '../../services/paypal';

const router = express.Router();
router.use(requireAdmin); // everything here is admin-only

const CATEGORIES = new Set(['music', 'clothing', 'accessory']);

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
  if (typeof b.title !== 'string' || !b.title.trim()) {
    res.status(400).json({ success: false, error: 'title is required.' });
    return;
  }
  const id = await products.createProduct({
    category: b.category,
    type: String(b.type).trim(),
    title: String(b.title).trim(),
    subtitle: b.subtitle ?? null,
    description: b.description ?? null,
    priceCents: Number(b.priceCents) || 0,
    currency: b.currency,
    weightGrams: b.weightGrams ?? null,
  });
  const row = await products.getProductById(id);
  res.status(201).json({ success: true, product: row });
});

// List (all statuses).
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const category = req.query.category as products.Category | undefined;
  const status = req.query.status as products.Status | undefined;
  const rows = await products.listProducts({ category, status });
  res.json({ success: true, products: rows });
});

// Detail with related rows.
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const row = await products.getProductById(Number(req.params.id));
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  res.json({ success: true, product: await products.getFullProduct(row) });
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
    lengthSec: req.body.lengthSec ?? null,
    bpm: req.body.bpm ?? null,
    musicKey: req.body.musicKey ?? null,
    position: req.body.position ?? 0,
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
  if (!['mp3', 'wav', 'stems', 'exclusive'].includes(tier)) {
    res.status(400).json({ success: false, error: 'tier must be mp3 | wav | stems | exclusive.' });
    return;
  }
  await products.addLicenseTier(id, tier, Number(req.body?.priceCents) || 0);
  res.status(201).json({ success: true });
});

// Publish: flips status and auto-creates the PayPal catalog product.
router.post('/:id/publish', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const row = await products.getProductById(id);
  if (!row) {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }

  let paypalWarning: string | undefined;
  if (!row.paypal_product_id && isPayPalConfigured()) {
    try {
      const appBase = process.env.APP_URL || 'https://www.theundergroundrailroad.world/GabrielGomez';
      const pp = await createCatalogProduct({
        name: row.title.slice(0, 127),
        description: (row.description ?? row.subtitle ?? row.title).slice(0, 256),
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
