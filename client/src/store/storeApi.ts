// Public storefront API client. All calls return typed data or throw a friendly Error.
import { getToken } from './account/accountApi'

const BASE = '/GabrielGomez/api'

// Attach the customer token when signed in, so orders link to the account.
function authHeader(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function get<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`)
  } catch {
    throw new Error('Network error — check your connection and try again.')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Network error — please try again.')
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data as T
}

export type Category = 'music' | 'clothing' | 'accessory'

export interface ProductSummary {
  id: number
  slug: string
  category: Category
  type: string
  title: string
  subtitle: string | null
  price_cents: number
  currency: string
  is_digital: number
  coverUrl: string | null
}

export interface Track {
  id: number
  position: number
  name: string
  artist: string | null
  genre: string | null
  style: string | null
  length_sec: number | null
  bpm: number | null
  format: string | null
  bitrate_kbps: number | null
  waveform_json: number[] | null
  previewUrl: string | null
}

export interface Variant {
  id: number
  size: string | null
  color: string | null
  style: string | null
  stock_qty: number
  price_delta_cents: number
}

export interface ProductDetail extends ProductSummary {
  description: string | null
  tracks: Track[]
  variants: Variant[]
  licenseTiers: Array<{ tier: string; price_cents: number }>
  musicMeta: Record<string, unknown> | null
}

export interface StoreConfig {
  paypalClientId: string
  paypalEnv: string
  currency: string
  shipping: { flatCents: number; perItemCents: number }
}

export const storeApi = {
  config: () => get<{ paypalClientId: string; paypalEnv: string; currency: string; shipping: StoreConfig['shipping'] }>('/store/config'),
  products: (category?: Category) =>
    get<{ products: ProductSummary[] }>(`/store/products${category ? `?category=${category}` : ''}`),
  product: (slug: string) => get<{ product: ProductDetail }>(`/store/products/${encodeURIComponent(slug)}`),
  createOrder: (body: unknown) =>
    post<{ orderNumber: string; paypalOrderId: string; totalCents: number }>('/store/checkout/create-order', body),
  capture: (paypalOrderId: string) =>
    post<{ orderNumber: string; status: string; downloads?: string[] }>('/store/checkout/capture', { paypalOrderId }),
  claimFree: (body: unknown) =>
    post<{ orderNumber: string; downloads?: string[] }>('/store/checkout/claim-free', body),
}

export function formatPrice(cents: number, currency = 'USD'): string {
  if (cents <= 0) return 'Free'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}
export function formatSecs(s: number | null): string {
  if (!s && s !== 0) return '—'
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}
