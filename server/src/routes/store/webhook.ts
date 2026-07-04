import express, { type Request, type Response } from 'express';
import { type RowDataPacket } from 'mysql2/promise';
import { query, execute } from '../../db/pool';
import { verifyWebhookSignature } from '../../services/paypal';
import { createDigitalGrants } from '../../services/delivery';

// =============================================================================
// PayPal webhook — signature-verified + idempotent. A safety net that reconciles
// captures/refunds even if the browser never calls /capture (closed tab, etc.).
// =============================================================================

const router = express.Router();

router.post('/paypal', async (req: Request, res: Response): Promise<void> => {
  const event = req.body as { id?: string; event_type?: string; resource?: Record<string, unknown> };
  const headers = req.headers as unknown as Record<string, string>;

  // Verify authenticity. If verification isn't configured, reject.
  let ok = false;
  try {
    ok = await verifyWebhookSignature(headers, event);
  } catch {
    ok = false;
  }
  if (!ok) {
    res.status(400).json({ success: false, error: 'Signature verification failed.' });
    return;
  }

  const eventId = event.id || '';
  if (!eventId) {
    res.status(400).end();
    return;
  }

  // Idempotency: record the event; if it's a duplicate, ack and stop.
  const ins = await execute(
    'INSERT IGNORE INTO paypal_webhooks (event_id, event_type, payload) VALUES (?, ?, ?)',
    [eventId, event.event_type ?? null, JSON.stringify(event)],
  );
  if (ins.affectedRows === 0) {
    res.json({ success: true, duplicate: true });
    return;
  }

  const resource = event.resource || {};
  const supplementary = resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined;
  const orderId = supplementary?.related_ids?.order_id || (resource.id as string | undefined);

  try {
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED' && orderId) {
      const rows = await query<RowDataPacket[]>('SELECT * FROM orders WHERE paypal_order_id = ?', [orderId]);
      const order = rows[0];
      if (order && order.status !== 'paid' && order.status !== 'fulfilled') {
        await execute('UPDATE orders SET status = ?, paid_at = COALESCE(paid_at, NOW()) WHERE id = ?', ['paid', order.id]);
        await createDigitalGrants(order.id);
      }
    } else if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED' && orderId) {
      await execute('UPDATE orders SET status = ? WHERE paypal_order_id = ?', ['refunded', orderId]);
    }
  } catch (err) {
    console.error('[webhook] reconcile failed:', err instanceof Error ? err.message : err);
  }

  await execute('UPDATE paypal_webhooks SET processed = 1 WHERE event_id = ?', [eventId]);
  res.json({ success: true });
});

export default router;
