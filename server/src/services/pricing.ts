import { type RowDataPacket } from 'mysql2/promise';
import { query } from '../db/pool';

// =============================================================================
// Server-side cart pricing — the source of truth for money. Prices, shipping and
// stock are always recomputed from the DB; the client's numbers are never
// trusted. Throws on any invalid/unavailable item.
// =============================================================================

export interface CartItemInput {
  productId: number;
  variantId?: number | null;
  licenseTier?: string | null;
  quantity: number;
}

export interface PricedLine {
  productId: number;
  variantId: number | null;
  licenseTier: string | null;
  title: string;
  unitCents: number;
  quantity: number;
  isDigital: boolean;
}

export interface CartTotals {
  lines: PricedLine[];
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  hasPhysical: boolean;
  hasDigital: boolean;
}

const SHIP_FLAT = Number(process.env.SHIPPING_FLAT_CENTS || 700);
const SHIP_PER_ITEM = Number(process.env.SHIPPING_PER_ITEM_CENTS || 200);

interface ProductRow extends RowDataPacket {
  id: number;
  title: string;
  status: string;
  price_cents: number;
  currency: string;
  is_digital: number;
}
interface VariantRow extends RowDataPacket {
  id: number;
  product_id: number;
  price_delta_cents: number;
  stock_qty: number;
  size: string | null;
  color: string | null;
}
interface TierRow extends RowDataPacket {
  price_cents: number;
  is_active: number;
}

export async function computeCart(items: CartItemInput[]): Promise<CartTotals> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Cart is empty.');
  }

  const lines: PricedLine[] = [];
  let subtotalCents = 0;
  let hasPhysical = false;
  let hasDigital = false;
  let physicalUnits = 0;
  let currency = 'USD';

  for (const raw of items) {
    const productId = Number(raw.productId);
    const quantity = Math.max(1, Math.min(Number(raw.quantity) || 1, 99));

    const prows = await query<ProductRow[]>('SELECT * FROM products WHERE id = ?', [productId]);
    const product = prows[0];
    if (!product || product.status !== 'published') {
      throw new Error(`Product ${productId} is not available.`);
    }
    currency = product.currency || 'USD';
    const isDigital = product.is_digital === 1;

    let unitCents = product.price_cents;

    // License tier overrides the base price for music.
    if (raw.licenseTier) {
      const trows = await query<TierRow[]>(
        'SELECT price_cents, is_active FROM music_license_tiers WHERE product_id = ? AND tier = ?',
        [productId, raw.licenseTier],
      );
      const tier = trows[0];
      if (!tier || tier.is_active !== 1) throw new Error('Selected license tier is unavailable.');
      unitCents = tier.price_cents;
    }

    let variantId: number | null = null;
    if (raw.variantId) {
      const vrows = await query<VariantRow[]>('SELECT * FROM product_variants WHERE id = ?', [Number(raw.variantId)]);
      const variant = vrows[0];
      if (!variant || variant.product_id !== productId) throw new Error('Invalid variant for this product.');
      if (!isDigital && variant.stock_qty < quantity) {
        throw new Error(`Only ${variant.stock_qty} of "${product.title}" left in that option.`);
      }
      unitCents += variant.price_delta_cents;
      variantId = variant.id;
    }

    if (isDigital) hasDigital = true;
    else {
      hasPhysical = true;
      physicalUnits += quantity;
    }

    subtotalCents += unitCents * quantity;
    lines.push({
      productId,
      variantId,
      licenseTier: raw.licenseTier ?? null,
      title: product.title,
      unitCents,
      quantity,
      isDigital,
    });
  }

  const shippingCents = hasPhysical ? SHIP_FLAT + SHIP_PER_ITEM * physicalUnits : 0;
  const taxCents = 0; // jurisdictional tax integration is a later concern
  const totalCents = subtotalCents + shippingCents + taxCents;

  return { lines, currency, subtotalCents, shippingCents, taxCents, totalCents, hasPhysical, hasDigital };
}
