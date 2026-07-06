// =============================================================================
// PayPal service — REST via fetch (no SDK). Client-credentials token (cached),
// Catalog Products (auto-created on publish), Orders v2 (one-time checkout),
// capture, and webhook signature verification. Sandbox/live via PAYPAL_ENV.
// =============================================================================

function baseUrl(): string {
  return (process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isPayPalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function accessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;

  const id = process.env.PAYPAL_CLIENT_ID || '';
  const secret = process.env.PAYPAL_CLIENT_SECRET || '';
  if (!id || !secret) throw new Error('PayPal not configured (missing PAYPAL_CLIENT_ID/SECRET)');

  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`PayPal token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

async function ppFetch<T>(pathname: string, init: RequestInit): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${baseUrl()}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PayPal ${init.method || 'GET'} ${pathname} ${res.status}: ${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// --- Catalog Products -------------------------------------------------------
export interface CatalogProductInput {
  name: string;
  description?: string;
  type: 'DIGITAL' | 'PHYSICAL' | 'SERVICE';
  category?: string;
  imageUrl?: string;
  homeUrl?: string;
  requestId: string; // idempotency key
}

export async function createCatalogProduct(input: CatalogProductInput): Promise<{ id: string }> {
  return ppFetch<{ id: string }>('/v1/catalogs/products', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': input.requestId },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      type: input.type,
      ...(input.category ? { category: input.category } : {}),
      ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
      ...(input.homeUrl ? { home_url: input.homeUrl } : {}),
    }),
  });
}

// --- Orders v2 (one-time checkout) ------------------------------------------
export interface OrderMoney {
  currency: string;
  totalCents: number;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
}
export interface OrderLine {
  name: string;
  unitCents: number;
  quantity: number;
  isDigital: boolean;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function createOrder(
  money_: OrderMoney,
  lines: OrderLine[],
  opts: { returnUrl?: string; cancelUrl?: string } = {},
): Promise<{ id: string; status: string; links: { href: string; rel: string }[] }> {
  const currency = money_.currency || 'USD';
  const hasPhysical = lines.some((l) => !l.isDigital);
  return ppFetch('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: money(money_.totalCents),
            breakdown: {
              item_total: { currency_code: currency, value: money(money_.subtotalCents) },
              shipping: { currency_code: currency, value: money(money_.shippingCents) },
              tax_total: { currency_code: currency, value: money(money_.taxCents) },
            },
          },
          items: lines.map((l) => ({
            name: l.name.slice(0, 127),
            quantity: String(l.quantity),
            unit_amount: { currency_code: currency, value: money(l.unitCents) },
            category: l.isDigital ? 'DIGITAL_GOODS' : 'PHYSICAL_GOODS',
          })),
        },
      ],
      application_context: {
        brand_name: process.env.DISPLAY_APP_NAME || 'SonSoul',
        shipping_preference: hasPhysical ? 'GET_FROM_FILE' : 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        ...(opts.returnUrl ? { return_url: opts.returnUrl } : {}),
        ...(opts.cancelUrl ? { cancel_url: opts.cancelUrl } : {}),
      },
    }),
  });
}

export async function captureOrder(orderId: string): Promise<{
  id: string;
  status: string;
  purchase_units?: unknown[];
}> {
  return ppFetch(`/v2/checkout/orders/${orderId}/capture`, { method: 'POST', body: '{}' });
}

export async function getOrder(orderId: string): Promise<{ id: string; status: string }> {
  return ppFetch(`/v2/checkout/orders/${orderId}`, { method: 'GET' });
}

// Refund a captured payment. Omit amount for a full refund; pass cents for a
// partial. Idempotency key prevents a double-refund on a retried request.
export async function refundCapture(
  captureId: string,
  opts: { amountCents?: number; currency?: string; requestId?: string; note?: string } = {},
): Promise<{ id: string; status: string }> {
  const body: Record<string, unknown> = {};
  if (opts.amountCents != null) {
    body.amount = { value: money(opts.amountCents), currency_code: (opts.currency || 'USD').toUpperCase() };
  }
  if (opts.note) body.note_to_payer = opts.note.slice(0, 255);
  return ppFetch(`/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: opts.requestId ? { 'PayPal-Request-Id': opts.requestId } : {},
    body: JSON.stringify(body),
  });
}

// --- Webhook verification ---------------------------------------------------
export async function verifyWebhookSignature(headers: Record<string, string>, rawBody: unknown): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const result = await ppFetch<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: rawBody,
    }),
  });
  return result.verification_status === 'SUCCESS';
}
