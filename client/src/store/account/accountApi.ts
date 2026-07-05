// Customer account API client. Token in localStorage; friendly typed errors.
const BASE = '/GabrielGomez/api/store/account'
const TOKEN_KEY = 'sonsoul_customer_token'

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

export class ApiError extends Error {
  field?: string
  status: number
  constructor(message: string, status: number, field?: string) {
    super(message)
    this.status = status
    this.field = field
  }
}

async function req<T>(path: string, method: string, body?: unknown, auth = false): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? authHeader() : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Network error — please try again.', 0)
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; field?: string }
  if (res.status === 401 && auth) setToken(null)
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.field)
  return data as T
}

export interface Customer {
  id: number
  email: string
  name: string | null
  emailVerified?: boolean
  email_verified?: number
  marketing_opt_in?: number
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
  status: string
  total_cents: number
  currency: string
  created_at: string
  items: OrderItem[]
}
export interface DownloadItem {
  title: string
  orderNumber: string
  url: string
  expiresAt: string
  remaining: number
}

export interface RegisterInput {
  email: string
  password: string
  name?: string
  marketingOptIn?: boolean
}

export const accountApi = {
  register: (b: RegisterInput) => req<{ token: string; customer: Customer }>('/register', 'POST', b),
  login: (email: string, password: string) =>
    req<{ token: string; customer: Customer }>('/login', 'POST', { email, password }),
  me: () => req<{ customer: Customer }>('/me', 'GET', undefined, true),
  orders: () => req<{ orders: Order[] }>('/orders', 'GET', undefined, true),
  downloads: () => req<{ downloads: DownloadItem[] }>('/downloads', 'GET', undefined, true),
  verifyEmail: (token: string) => req<{ success: boolean }>('/verify-email', 'POST', { token }),
  forgotPassword: (email: string) => req<{ message: string }>('/forgot-password', 'POST', { email }),
  resetPassword: (token: string, newPassword: string) =>
    req<{ success: boolean }>('/reset-password', 'POST', { token, newPassword }),
}

export function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

/** Mirrors the server password policy; returns the unmet requirements. */
export function passwordIssues(pw: string): string[] {
  const issues: string[] = []
  if (pw.length < 8) issues.push('at least 8 characters')
  if (!/[a-z]/.test(pw)) issues.push('a lowercase letter')
  if (!/[A-Z]/.test(pw)) issues.push('an uppercase letter')
  if (!/\d/.test(pw)) issues.push('a number')
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('a symbol')
  return issues
}
