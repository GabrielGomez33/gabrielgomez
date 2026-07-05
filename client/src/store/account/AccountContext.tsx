import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { accountApi, getToken, setToken, type Customer, type RegisterInput } from './accountApi'

interface AccountCtx {
  customer: Customer | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AccountCtx | null>(null)

export function AccountProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(Boolean(getToken()))

  // Validate a stored token on load; clear it silently if expired.
  useEffect(() => {
    if (!getToken()) return
    let alive = true
    accountApi
      .me()
      .then((d) => alive && setCustomer(d.customer))
      .catch(() => {
        setToken(null)
        if (alive) setCustomer(null)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const value: AccountCtx = {
    customer,
    loading,
    login: async (email, password) => {
      const d = await accountApi.login(email, password)
      setToken(d.token)
      setCustomer(d.customer)
    },
    register: async (input) => {
      const d = await accountApi.register(input)
      setToken(d.token)
      setCustomer(d.customer)
    },
    logout: () => {
      setToken(null)
      setCustomer(null)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAccount(): AccountCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAccount must be used within AccountProvider')
  return c
}
