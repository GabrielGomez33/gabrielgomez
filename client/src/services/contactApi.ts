// Client for the portfolio contact endpoint (Apache proxies this to :8448).
const API_BASE = '/GabrielGomez/api'

export interface ContactInput {
  name: string
  email: string
  subject: string
  message: string
  website?: string // honeypot — real users leave this empty
}

export interface ContactResult {
  ok: boolean
  message?: string
  error?: string
  retryAfterSec?: number
}

export async function sendContact(input: ContactInput): Promise<ContactResult> {
  try {
    const res = await fetch(`${API_BASE}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const data = (await res.json().catch(() => ({}))) as {
      data?: { message?: string }
      error?: string
      retryAfterSec?: number
    }
    if (res.ok) {
      return { ok: true, message: data.data?.message ?? 'Message sent.' }
    }
    return {
      ok: false,
      error: data.error ?? 'Something went wrong. Please try again.',
      retryAfterSec: data.retryAfterSec,
    }
  } catch {
    return { ok: false, error: 'Network error — please try again.' }
  }
}
