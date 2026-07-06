import express, { type Request, type Response } from 'express';
import { type RowDataPacket } from 'mysql2/promise';
import { requireAdmin } from '../../auth/middleware';
import { query, execute } from '../../db/pool';
import { refundCapture, isPayPalConfigured } from '../../services/paypal';
import { revokeOrderGrants } from '../../services/delivery';

// =============================================================================
// Admin orders: list real orders and issue refunds. A refund reverses the
// PayPal capture (skipped for $0 free orders), flips the order to 'refunded',
// and revokes its download grants so the links stop working.
// =============================================================================

const router = express.Router();
router.use(requireAdmin);

// List orders (most recent first). Only meaningful states — not abandoned carts.
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status as string | undefined;
  const where = status
    ? 'status = ?'
    : "status IN ('paid','fulfilled','refunded')";
  const params = status ? [status] : [];
  const orders = await query<RowDataPacket[]>(
    `SELECT id, order_number, email, status, currency, total_cents, has_physical, has_digital,
            fulfillment_status, paypal_capture_id, paid_at, created_at
       FROM orders
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT 200`,
    params,
  );
  for (const o of orders) {
    o.items = await query<RowDataPacket[]>(
      'SELECT title_snapshot, unit_price_cents, quantity, license_tier, is_digital FROM order_items WHERE order_id = ?',
      [o.id],
    );
  }
  res.json({ success: true, orders });
});

// Refund an order.
router.post('/:id/refund', async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const rows = await query<RowDataPacket[]>('SELECT * FROM orders WHERE id = ?', [id]);
  const order = rows[0];
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found.' });
    return;
  }
  if (order.status === 'refunded') {
    res.json({ success: true, alreadyRefunded: true, order });
    return;
  }
  if (order.status !== 'paid' && order.status !== 'fulfilled') {
    res.status(400).json({ success: false, error: `Only paid orders can be refunded (this one is ${order.status}).` });
    return;
  }

  // Free orders ($0) never charged PayPal — just revoke access and mark refunded.
  if (order.total_cents > 0) {
    if (!order.paypal_capture_id) {
      res.status(400).json({ success: false, error: 'No PayPal capture on this order to refund.' });
      return;
    }
    if (!isPayPalConfigured()) {
      res.status(503).json({ success: false, error: 'PayPal is not configured.' });
      return;
    }
    try {
      const r = await refundCapture(order.paypal_capture_id, {
        requestId: `refund-${order.id}`,
        note: `Refund for order ${order.order_number}`,
      });
      if (r.status && !['COMPLETED', 'PENDING'].includes(r.status)) {
        throw new Error(`PayPal refund status ${r.status}`);
      }
    } catch (err) {
      console.error('[admin/orders] refund failed:', err instanceof Error ? err.message : err);
      res.status(502).json({ success: false, error: 'PayPal refund failed. Nothing was changed.' });
      return;
    }
  }

  await execute("UPDATE orders SET status = 'refunded', fulfillment_status = 'none' WHERE id = ?", [id]);
  await revokeOrderGrants(id);
  const updated = await query<RowDataPacket[]>('SELECT * FROM orders WHERE id = ?', [id]);
  res.json({ success: true, order: updated[0] });
});

export default router;
