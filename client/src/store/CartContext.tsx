import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export interface CartItem {
  productId: number
  slug: string
  title: string
  unitCents: number
  currency: string
  isDigital: boolean
  quantity: number
  variantId?: number | null
  variantLabel?: string | null
  licenseTier?: string | null
  coverUrl?: string | null
}

interface CartCtx {
  items: CartItem[]
  add: (item: CartItem) => void
  remove: (key: string) => void
  setQty: (key: string, qty: number) => void
  clear: () => void
  count: number
  subtotalCents: number
}

const STORAGE_KEY = 'sonsoul_cart_v1'
const Ctx = createContext<CartCtx | null>(null)

/** A stable key so the same product+variant+tier stacks instead of duplicating. */
export function itemKey(i: Pick<CartItem, 'productId' | 'variantId' | 'licenseTier'>): string {
  return `${i.productId}:${i.variantId ?? ''}:${i.licenseTier ?? ''}`
}

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      /* storage full / disabled — cart just won't persist */
    }
  }, [items])

  const api = useMemo<CartCtx>(() => {
    return {
      items,
      add: (item) =>
        setItems((prev) => {
          const key = itemKey(item)
          const existing = prev.find((p) => itemKey(p) === key)
          // Digital items are single-quantity; physical can stack.
          if (existing) {
            if (item.isDigital) return prev
            return prev.map((p) => (itemKey(p) === key ? { ...p, quantity: Math.min(p.quantity + item.quantity, 99) } : p))
          }
          return [...prev, { ...item, quantity: item.isDigital ? 1 : Math.max(1, item.quantity) }]
        }),
      remove: (key) => setItems((prev) => prev.filter((p) => itemKey(p) !== key)),
      setQty: (key, qty) =>
        setItems((prev) =>
          prev.map((p) => (itemKey(p) === key ? { ...p, quantity: Math.max(1, Math.min(qty, 99)) } : p)),
        ),
      clear: () => setItems([]),
      count: items.reduce((n, i) => n + i.quantity, 0),
      subtotalCents: items.reduce((n, i) => n + i.unitCents * i.quantity, 0),
    }
  }, [items])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useCart(): CartCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCart must be used within CartProvider')
  return c
}
