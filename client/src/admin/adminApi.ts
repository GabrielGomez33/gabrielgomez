// Admin API client for the SonSoul creator pipeline. Token in localStorage.
const BASE = '/GabrielGomez/api'
const TOKEN_KEY = 'sonsoul_admin_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

function authHeader(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

async function jsonReq<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401) {
    setToken(null)
    throw new Error('Session expired — please log in again.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  return data as T
}

export interface Product {
  id: number
  slug: string
  category: 'music' | 'clothing' | 'accessory'
  type: string
  title: string
  subtitle: string | null
  description: string | null
  price_cents: number
  currency: string
  status: 'draft' | 'published' | 'archived'
  is_digital: number
  stems_available?: number | null
  cover_image_path: string | null
  cover_thumb_path?: string | null
  coverUrl?: string | null
  coverThumbUrl?: string | null
  paypal_product_id: string | null
  tracks?: Track[]
  variants?: Variant[]
  licenseTiers?: Array<Record<string, unknown>>
  musicMeta?: Record<string, unknown> | null
}
export interface Track {
  id: number
  position: number
  name: string
  genre: string | null
  style: string | null
  length_sec: number | null
  format: string | null
  bitrate_kbps: number | null
  file_size_bytes: number | null
  preview_path: string | null
  // Folder-analysis classification (sample packs + enriched beatpacks/albums).
  kind: 'one_shot' | 'loop' | 'unknown' | null
  sample_group: string | null
  sample_category: string | null
  is_preview: number
  bpm: number | null
  music_key: string | null
  rel_dir: string | null
}
export interface Variant {
  id: number
  size: string | null
  color: string | null
  style: string | null
  stock_qty: number
  price_delta_cents: number
}
export interface AttrOption {
  kind: string
  value: string
  label: string
}
export interface OrderItem {
  title_snapshot: string
  unit_price_cents: number
  quantity: number
  license_tier: string | null
  is_digital: number
}
export interface Order {
  id: number
  order_number: string
  email: string
  status: string
  currency: string
  total_cents: number
  has_physical: number
  has_digital: number
  fulfillment_status: string
  paypal_capture_id: string | null
  paid_at: string | null
  created_at: string
  items: OrderItem[]
}

export const adminApi = {
  async login(username: string, password: string): Promise<void> {
    const data = await jsonReq<{ token: string }>('/admin/auth/login', 'POST', { username, password })
    setToken(data.token)
  },
  logout(): void {
    setToken(null)
  },
  listProducts(category?: string): Promise<{ products: Product[] }> {
    const q = category ? `?category=${category}` : ''
    return jsonReq(`/admin/products${q}`, 'GET')
  },
  getProduct(id: number): Promise<{ product: Product }> {
    return jsonReq(`/admin/products/${id}`, 'GET')
  },
  createProduct(input: Record<string, unknown>): Promise<{ product: Product }> {
    return jsonReq('/admin/products', 'POST', input)
  },
  updateProduct(id: number, patch: Record<string, unknown>): Promise<{ product: Product }> {
    return jsonReq(`/admin/products/${id}`, 'PATCH', patch)
  },
  setMusicMeta(id: number, meta: Record<string, unknown>): Promise<unknown> {
    return jsonReq(`/admin/products/${id}/music-meta`, 'POST', meta)
  },
  addVariant(id: number, v: Record<string, unknown>): Promise<unknown> {
    return jsonReq(`/admin/products/${id}/variants`, 'POST', v)
  },
  addTier(id: number, tier: string, priceCents: number): Promise<unknown> {
    return jsonReq(`/admin/products/${id}/tiers`, 'POST', { tier, priceCents })
  },
  publish(id: number): Promise<{ product: Product; paypalWarning?: string }> {
    return jsonReq(`/admin/products/${id}/publish`, 'POST')
  },
  deleteProduct(id: number): Promise<unknown> {
    return jsonReq(`/admin/products/${id}`, 'DELETE')
  },
  async options(kind?: string): Promise<AttrOption[]> {
    const q = kind ? `?kind=${kind}` : ''
    const data = await jsonReq<{ options: AttrOption[] }>(`/admin/options${q}`, 'GET')
    return data.options
  },
  async uploadAudio(
    id: number,
    files: File[],
    meta: { genre?: string; style?: string },
  ): Promise<{ added?: unknown[]; isSamplePack?: boolean; previewCount?: number }> {
    const fd = new FormData()
    // Preserve folder structure: send each file's relative path (from a folder
    // upload) aligned by order with the files.
    const relPaths: string[] = []
    for (const f of files) {
      fd.append('files', f)
      relPaths.push((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
    }
    fd.append('relPaths', JSON.stringify(relPaths))
    if (meta.genre) fd.append('genre', meta.genre)
    if (meta.style) fd.append('style', meta.style)
    const res = await fetch(`${BASE}/admin/products/${id}/audio`, { method: 'POST', headers: authHeader(), body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed')
    return data
  },
  async autoPreviewSet(id: number, count = 10): Promise<{ previewCount: number }> {
    return jsonReq(`/admin/products/${id}/preview-set/auto`, 'POST', { count })
  },
  async toggleTrackPreview(id: number, trackId: number, on: boolean): Promise<{ previewCount: number }> {
    return jsonReq(`/admin/products/${id}/tracks/${trackId}/preview`, 'POST', { on })
  },
  async deleteTrack(id: number, trackId: number): Promise<unknown> {
    return jsonReq(`/admin/products/${id}/tracks/${trackId}`, 'DELETE')
  },
  async reanalyze(id: number): Promise<{ analyzed: number; previews: number }> {
    return jsonReq(`/admin/products/${id}/reanalyze`, 'POST')
  },
  listOrders(): Promise<{ orders: Order[] }> {
    return jsonReq('/admin/orders', 'GET')
  },
  refundOrder(id: number): Promise<{ order: Order; alreadyRefunded?: boolean }> {
    return jsonReq(`/admin/orders/${id}/refund`, 'POST')
  },
  async uploadCover(id: number, file: File): Promise<unknown> {
    const fd = new FormData()
    fd.append('image', file)
    const res = await fetch(`${BASE}/admin/products/${id}/cover`, { method: 'POST', headers: authHeader(), body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Cover upload failed')
    return data
  },
  async uploadStems(id: number, files: File[]): Promise<{ added: Array<Record<string, unknown>> }> {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    const res = await fetch(`${BASE}/admin/products/${id}/stems`, { method: 'POST', headers: authHeader(), body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || 'Stems upload failed')
    return data as { added: Array<Record<string, unknown>> }
  },
  listStems(id: number): Promise<{ stems: { group: string; name: string }[] }> {
    return jsonReq(`/admin/products/${id}/stems`, 'GET')
  },
  flagNoStems(id: number): Promise<unknown> {
    return jsonReq(`/admin/products/${id}/stems/none`, 'POST')
  },
}
