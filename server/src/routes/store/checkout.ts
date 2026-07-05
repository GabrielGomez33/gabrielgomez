import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import { type RowDataPacket } from 'mysql2/promise';
import { query, execute } from '../../db/pool';
import { computeCart, type CartItemInput } from '../../services/pricing';
import { createOrder as ppCreateOrder, captureOrder as ppCaptureOrder, isPayPalConfigured } from '../../services/paypal';
import { createDigitalGrants } from '../../services/delivery';
import { sendEmail, escapeHtml, renderEmail } from '../../services/emailService';

// =============================================================================
// Checkout. Prices are recomputed server-side (never trust the client). An order
// is created locally, then a PayPal order; on capture we re-verify the captured
// amount, mark paid, decrement stock atomically, and issue digital grants.
// =============================================================================

const router = express.Router();
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_URL = () => process.env.APP_URL || 'https://www.theundergroundrailroad.world/GabrielGomez';

function orderNumber(): string {
  return `SS-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
function truncateIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return ip.includes(':') ? ip.split(':').slice(0, 3).join(':') : ip.split('.').slice(0, 3).join('.') + '.0';
}
function money(cents: number, currency: string): string {
  return `$${(cents / 100).toFixed(2)} ${currency}`;
}
function downloadLinks(tokens: string[]): string[] {
  return tokens.map((t) => `${APP_URL()}/api/store/download/${t}`);
}

interface OrderLike {
  email: string;
  order_number: string;
  total_cents: number;
  currency: string;
}
function sendOrderEmail(order: OrderLike, downloads: string[]): void {
  const free = order.total_cents === 0;
  const bodyHtml = downloads.length
    ? `<p style="margin:0 0 10px;color:#cfcfcf;font-size:15px;">Your download${downloads.length > 1 ? 's' : ''}:</p>
       <ul style="margin:0;padding-left:18px;color:#cfcfcf;font-size:14px;">${downloads
         .map((d) => `<li style="margin:5px 0;"><a href="${d}" style="color:#f4f4f4;">${escapeHtml(d)}</a></li>`)
         .join('')}</ul>`
    : '';
  void sendEmail({
    to: order.email,
    subject: `Your order ${order.order_number}`,
    html: renderEmail({
      heading: free ? 'Your free download is ready' : 'Thanks for your order',
      intro: free
        ? `Order ${escapeHtml(order.order_number)} — free.`
        : `Order ${escapeHtml(order.order_number)} — total ${money(order.total_cents, order.currency)}.`,
      bodyHtml,
      footerNote: 'Your download links are valid for a limited time.',
    }),
    text: `Order ${order.order_number}${free ? ' (free)' : ` — total ${money(order.total_cents, order.currency)}`}.\n${downloads.join('\n')}`,
  }).catch(() => {});
}

// Light per-IP limit on free claims (they create orders + send email).
const FREE_WINDOW_MS = 15 * 60 * 1000;
const FREE_MAX = Number(process.env.FREE_CLAIM_RATE_LIMIT || 10);
const freeHits = new Map<string, { count: number; start: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of freeHits) if (now - w.start > FREE_WINDOW_MS) freeHits.delete(k);
}, FREE_WINDOW_MS).unref();
function freeLimited(ip: string): boolean {
  const now = Date.now();
  const w = freeHits.get(ip);
  if (!w || now - w.start > FREE_WINDOW_MS) {
    freeHits.set(ip, { count: 1, start: now });
    return false;
  }
  if (w.count >= FREE_MAX) return true;
  w.count += 1;
  return false;
}

// --- Create order ------------------------------------------------------------
router.post('/create-order', async (req: Request, res: Response): Promise<void> => {
  if (!isPayPalConfigured()) {
    res.status(503).json({ success: false, error: 'Payments are not configured.' });
    return;
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RX.test(email)) {
    res.status(400).json({ success: false, error: 'A valid email is required.' });
    return;
  }
  const items = req.body?.items as CartItemInput[];
  let totals;
  try {
    totals = await computeCart(items);
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Invalid cart.' });
    return;
  }

  // PayPal can't process a $0 charge — fail clearly instead of a 502.
  if (totals.totalCents <= 0) {
    res.status(400).json({
      success: false,
      error: 'This order total is $0.00 — there is nothing to charge. (The item needs a price.)',
    });
    return;
  }

  if (totals.hasPhysical) {
    const ship = req.body?.shipping;
    if (!ship || !ship.name || !ship.address) {
      res.status(400).json({ success: false, error: 'Shipping details are required for physical items.' });
      return;
    }
  }

  // Persist our order first (source of truth for the expected amount).
  const num = orderNumber();
  const result = await execute(
    `INSERT INTO orders
       (order_number, email, status, currency, subtotal_cents, shipping_cents, tax_cents, total_cents,
        has_physical, has_digital, ship_name, ship_address, ip_truncated)
     VALUES (?, ?, 'created', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      num,
      email,
      totals.currency,
      totals.subtotalCents,
      totals.shippingCents,
      totals.taxCents,
      totals.totalCents,
      totals.hasPhysical ? 1 : 0,
      totals.hasDigital ? 1 : 0,
      req.body?.shipping?.name ?? null,
      req.body?.shipping ? JSON.stringify(req.body.shipping) : null,
      truncateIp(req.ip),
    ],
  );
  const orderId = result.insertId;

  for (const line of totals.lines) {
    await execute(
      `INSERT INTO order_items
         (order_id, product_id, variant_id, license_tier, title_snapshot, is_digital, unit_price_cents, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, line.productId, line.variantId, line.licenseTier, line.title, line.isDigital ? 1 : 0, line.unitCents, line.quantity],
    );
  }

  // Create the PayPal order.
  let pp;
  try {
    pp = await ppCreateOrder(
      {
        currency: totals.currency,
        totalCents: totals.totalCents,
        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        taxCents: totals.taxCents,
      },
      totals.lines.map((l) => ({ name: l.title, unitCents: l.unitCents, quantity: l.quantity, isDigital: l.isDigital })),
    );
  } catch (err) {
    await execute('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', orderId]);
    res.status(502).json({ success: false, error: 'Could not start payment. Please try again.' });
    console.error('[checkout] PayPal create failed:', err instanceof Error ? err.message : err);
    return;
  }

  await execute('UPDATE orders SET paypal_order_id = ?, status = ? WHERE id = ?', [pp.id, 'pending', orderId]);
  res.status(201).json({
    success: true,
    orderNumber: num,
    paypalOrderId: pp.id,
    totalCents: totals.totalCents,
    currency: totals.currency,
  });
});

// --- Capture -----------------------------------------------------------------
router.post('/capture', async (req: Request, res: Response): Promise<void> => {
  const paypalOrderId = String(req.body?.paypalOrderId || '');
  if (!paypalOrderId) {
    res.status(400).json({ success: false, error: 'paypalOrderId is required.' });
    return;
  }

  const rows = await query<RowDataPacket[]>('SELECT * FROM orders WHERE paypal_order_id = ?', [paypalOrderId]);
  const order = rows[0];
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found.' });
    return;
  }

  // Idempotent: already captured → return existing result.
  if (order.status === 'paid' || order.status === 'fulfilled') {
    res.json({ success: true, orderNumber: order.order_number, status: order.status, alreadyCaptured: true });
    return;
  }

  let capture;
  try {
    capture = await ppCaptureOrder(paypalOrderId);
  } catch (err) {
    res.status(502).json({ success: false, error: 'Payment capture failed.' });
    console.error('[checkout] capture failed:', err instanceof Error ? err.message : err);
    return;
  }

  // Verify the money: captured amount must equal our recorded total.
  const unit = (capture.purchase_units?.[0] ?? {}) as {
    payments?: { captures?: Array<{ id: string; status: string; amount?: { value?: string } }> };
  };
  const cap = unit.payments?.captures?.[0];
  const capturedCents = Math.round(parseFloat(cap?.amount?.value || '0') * 100);
  if (capture.status !== 'COMPLETED' || !cap || cap.status !== 'COMPLETED' || capturedCents !== order.total_cents) {
    console.error('[checkout] amount/status mismatch', {
      orderTotal: order.total_cents,
      capturedCents,
      status: capture.status,
    });
    res.status(400).json({ success: false, error: 'Payment could not be verified.' });
    return;
  }

  // Mark paid.
  await execute('UPDATE orders SET status = ?, paypal_capture_id = ?, paid_at = NOW() WHERE id = ?', [
    'paid',
    cap.id,
    order.id,
  ]);

  // Decrement stock atomically for physical items (best-effort; log oversell).
  const physItems = await query<RowDataPacket[]>(
    'SELECT variant_id, quantity FROM order_items WHERE order_id = ? AND is_digital = 0 AND variant_id IS NOT NULL',
    [order.id],
  );
  for (const it of physItems) {
    const upd = await execute(
      'UPDATE product_variants SET stock_qty = stock_qty - ? WHERE id = ? AND stock_qty >= ?',
      [it.quantity, it.variant_id, it.quantity],
    );
    if (upd.affectedRows !== 1) {
      console.error(`[checkout] oversell risk: variant ${it.variant_id} order ${order.id}`);
    }
  }
  if (order.has_physical) {
    await execute('UPDATE orders SET fulfillment_status = ? WHERE id = ?', ['unfulfilled', order.id]);
  }

  // Issue digital download grants and send the confirmation (best-effort).
  const downloads = downloadLinks(await createDigitalGrants(order.id));
  sendOrderEmail(order as OrderLike, downloads);

  res.json({
    success: true,
    orderNumber: order.order_number,
    status: 'paid',
    downloads,
  });
});

// --- Claim a free order ------------------------------------------------------
// For carts whose recomputed total is $0 and contain no physical goods. There is
// no PayPal round-trip: we validate, record a paid order, issue grants, and email
// the links. Prices are always recomputed server-side, so a client cannot force a
// paid item to $0 — the total must genuinely be zero from real product prices.
router.post('/claim-free', async (req: Request, res: Response): Promise<void> => {
  const ip = truncateIp(req.ip) || 'unknown';
  if (freeLimited(ip)) {
    res.status(429).json({ success: false, error: 'Too many free claims. Please try again in a little while.' });
    return;
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RX.test(email)) {
    res.status(400).json({ success: false, error: 'A valid email is required.' });
    return;
  }

  const items = req.body?.items as CartItemInput[];
  let totals;
  try {
    totals = await computeCart(items);
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Invalid cart.' });
    return;
  }

  if (totals.hasPhysical) {
    res.status(400).json({ success: false, error: 'Physical items cannot be claimed for free.' });
    return;
  }
  if (totals.totalCents !== 0) {
    res.status(400).json({ success: false, error: 'This order is not free. Please check out normally.' });
    return;
  }

  const num = orderNumber();
  const result = await execute(
    `INSERT INTO orders
       (order_number, email, status, currency, subtotal_cents, shipping_cents, tax_cents, total_cents,
        has_physical, has_digital, ip_truncated, paid_at)
     VALUES (?, ?, 'paid', ?, 0, 0, 0, 0, 0, ?, ?, NOW())`,
    [num, email, totals.currency, totals.hasDigital ? 1 : 0, truncateIp(req.ip)],
  );
  const orderId = result.insertId;

  for (const line of totals.lines) {
    await execute(
      `INSERT INTO order_items
         (order_id, product_id, variant_id, license_tier, title_snapshot, is_digital, unit_price_cents, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, line.productId, line.variantId, line.licenseTier, line.title, line.isDigital ? 1 : 0, line.unitCents, line.quantity],
    );
  }

  const downloads = downloadLinks(await createDigitalGrants(orderId));
  sendOrderEmail({ email, order_number: num, total_cents: 0, currency: totals.currency }, downloads);

  res.status(201).json({ success: true, orderNumber: num, downloads });
});

export default router;
