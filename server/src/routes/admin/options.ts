import express, { type Request, type Response } from 'express';
import { type RowDataPacket } from 'mysql2/promise';
import { requireAdmin } from '../../auth/middleware';
import { query, execute } from '../../db/pool';

const router = express.Router();
router.use(requireAdmin);

const KINDS = new Set(['genre', 'size', 'color', 'style']);

// List options (optionally by kind).
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const kind = req.query.kind as string | undefined;
  const rows = kind
    ? await query<RowDataPacket[]>(
        'SELECT * FROM attribute_options WHERE kind = ? ORDER BY sort_order, label',
        [kind],
      )
    : await query<RowDataPacket[]>('SELECT * FROM attribute_options ORDER BY kind, sort_order, label');
  res.json({ success: true, options: rows });
});

// Add a new dropdown option.
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const kind = String(req.body?.kind || '');
  const label = String(req.body?.label || '').trim();
  if (!KINDS.has(kind) || !label) {
    res.status(400).json({ success: false, error: 'kind (genre|size|color|style) and label are required.' });
    return;
  }
  const value = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  await execute(
    `INSERT INTO attribute_options (kind, value, label, sort_order) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = 1`,
    [kind, value, label, Number(req.body?.sortOrder) || 0],
  );
  res.status(201).json({ success: true, value });
});

export default router;
