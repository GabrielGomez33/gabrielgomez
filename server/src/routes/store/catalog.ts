import express, { type Request, type Response } from 'express';
import { type RowDataPacket } from 'mysql2/promise';
import { query } from '../../db/pool';
import * as products from '../../services/products';

// Public storefront catalog (published products only). No auth.
const router = express.Router();

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
  res.json({ success: true, products: rows });
});

// Published product detail by slug (with tracks/variants/tiers/images).
router.get('/products/:slug', async (req: Request, res: Response): Promise<void> => {
  const row = await products.getProductBySlug(String(req.params.slug));
  if (!row || row.status !== 'published') {
    res.status(404).json({ success: false, error: 'Not found.' });
    return;
  }
  res.json({ success: true, product: await products.getFullProduct(row) });
});

export default router;
