import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { storeApi, formatPrice, licenseLabel, type StoreConfig } from './storeApi'
import { useCart } from './CartContext'
import { useAccount } from './account/AccountContext'

// PayPal SDK is injected at runtime; we only touch the minimal surface we use.
interface PayPalButtons {
  render: (el: HTMLElement) => void
}
interface PayPalNamespace {
  Buttons: (opts: Record<string, unknown>) => PayPalButtons
}
declare global {
  interface Window {
    paypal?: PayPalNamespace
  }
}

function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function loadSdk(clientId: string, currency: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.paypal) return resolve()
    const existing = document.querySelector('script[data-paypal]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('sdk')))
      return
    }
    const s = document.createElement('script')
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${currency}&intent=capture`
    s.setAttribute('data-paypal', '1')
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('sdk'))
    document.body.appendChild(s)
  })
}

export function Checkout() {
  const cart = useCart()
  const navigate = useNavigate()
  const { customer } = useAccount()
  const [config, setConfig] = useState<StoreConfig | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ orderNumber: string; downloads?: string[] } | null>(null)

  const hasPhysical = cart.items.some((i) => !i.isDigital)
  const isFree = cart.subtotalCents <= 0 && !hasPhysical && cart.items.length > 0
  const [claiming, setClaiming] = useState(false)
  const [email, setEmail] = useState(customer?.email ?? '')
  const [agreed, setAgreed] = useState(false)
  const [ship, setShip] = useState({ name: '', line1: '', city: '', region: '', postal: '', country: '' })

  // Refs so the PayPal callbacks (rendered once) always read the latest values.
  const emailRef = useRef(email)
  const shipRef = useRef(ship)
  const itemsRef = useRef(cart.items)
  const agreedRef = useRef(agreed)
  emailRef.current = email
  shipRef.current = ship
  itemsRef.current = cart.items
  agreedRef.current = agreed

  const containerRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef(false)

  useEffect(() => {
    if (cart.items.length === 0 && !success) navigate('/store/cart', { replace: true })
  }, [cart.items.length, success, navigate])

  useEffect(() => {
    storeApi.config().then(setConfig).catch(() => setError('Could not load checkout. Please try again.'))
  }, [])

  async function claimFree() {
    setError('')
    if (!validEmail(email)) {
      setError('Enter a valid email for your downloads.')
      return
    }
    if (!agreed) {
      setError('Please agree to the terms and license before continuing.')
      return
    }
    setClaiming(true)
    try {
      const items = cart.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId ?? undefined,
        licenseTier: i.licenseTier ?? undefined,
        quantity: i.quantity,
      }))
      const r = await storeApi.claimFree({ email: email.trim().toLowerCase(), items })
      cart.clear()
      setSuccess({ orderNumber: r.orderNumber, downloads: r.downloads })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete your free order. Please try again.')
    } finally {
      setClaiming(false)
    }
  }

  useEffect(() => {
    if (isFree || !config?.paypalClientId || renderedRef.current || !containerRef.current || success) return
    renderedRef.current = true
    loadSdk(config.paypalClientId, config.currency)
      .then(() => {
        if (!window.paypal || !containerRef.current) throw new Error('sdk')
        window.paypal
          .Buttons({
            style: { color: 'black', shape: 'pill', label: 'pay', height: 46 },
            createOrder: async () => {
              setError('')
              if (!validEmail(emailRef.current)) {
                setError('Enter a valid email for your receipt & downloads.')
                throw new Error('email')
              }
              if (!agreedRef.current) {
                setError('Please agree to the terms and license before continuing.')
                throw new Error('agree')
              }
              const s = shipRef.current
              const shipping = hasPhysical
                ? { ...s, address: `${s.line1}, ${s.city}, ${s.region} ${s.postal}, ${s.country}` }
                : undefined
              if (hasPhysical && (!s.name || !s.line1 || !s.city || !s.postal || !s.country)) {
                setError('Please complete your shipping details.')
                throw new Error('ship')
              }
              const items = itemsRef.current.map((i) => ({
                productId: i.productId,
                variantId: i.variantId ?? undefined,
                licenseTier: i.licenseTier ?? undefined,
                quantity: i.quantity,
              }))
              const r = await storeApi.createOrder({ email: emailRef.current.trim().toLowerCase(), items, shipping })
              return r.paypalOrderId
            },
            onApprove: async (data: { orderID: string }) => {
              try {
                const r = await storeApi.capture(data.orderID)
                cart.clear()
                setSuccess({ orderNumber: r.orderNumber, downloads: r.downloads })
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Payment captured but confirmation failed — check your email.')
              }
            },
            onError: () => setError('Payment could not be completed. Please try again.'),
          })
          .render(containerRef.current)
      })
      .catch(() => {
        renderedRef.current = false
        setError('Could not load PayPal. Refresh and try again.')
      })
  }, [config, success, hasPhysical, cart, isFree])

  if (success) {
    return (
      <div className="checkout checkout--done">
        <h1 className="checkout__title">Thank you</h1>
        <p className="checkout__sub">Order <b>{success.orderNumber}</b> is confirmed. A receipt is on its way.</p>
        {success.downloads && success.downloads.length > 0 && (
          <div className="checkout__downloads">
            <p>Your downloads:</p>
            <ul>
              {success.downloads.map((d, i) => (
                <li key={i}><a href={d}>Download {i + 1}</a></li>
              ))}
            </ul>
          </div>
        )}
        <Link to="/store/music" className="st__btn">Back to the store</Link>
      </div>
    )
  }

  return (
    <div className="checkout">
      <h1 className="checkout__title">Checkout</h1>

      <div className="checkout__grid">
        <div className="checkout__form">
          <label className="checkout__field">
            <span>Email (for receipt &amp; downloads)</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>

          {hasPhysical && (
            <fieldset className="checkout__ship">
              <legend>Shipping</legend>
              <input placeholder="Full name" value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} />
              <input placeholder="Address" value={ship.line1} onChange={(e) => setShip({ ...ship, line1: e.target.value })} />
              <div className="checkout__ship-row">
                <input placeholder="City" value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} />
                <input placeholder="State/Region" value={ship.region} onChange={(e) => setShip({ ...ship, region: e.target.value })} />
              </div>
              <div className="checkout__ship-row">
                <input placeholder="Postal code" value={ship.postal} onChange={(e) => setShip({ ...ship, postal: e.target.value })} />
                <input placeholder="Country" value={ship.country} onChange={(e) => setShip({ ...ship, country: e.target.value })} />
              </div>
            </fieldset>
          )}

          <label className="checkout__agree">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I have read and agree to the{' '}
              <Link to="/store/terms">Terms</Link>,{' '}
              <Link to="/store/terms#refund">Refund Policy</Link>, and the applicable{' '}
              <Link to="/store/terms#licenses">License Agreement</Link> for the items in my order.
            </span>
          </label>

          {error && <p className="checkout__error" role="alert">{error}</p>}
          {isFree ? (
            <button type="button" className="st__btn checkout__free-btn" onClick={claimFree} disabled={claiming || !agreed}>
              {claiming ? 'Preparing your download…' : 'Get it free'}
            </button>
          ) : (
            <>
              <div ref={containerRef} className="checkout__paypal" />
              {!config && <p className="state">Loading payment…</p>}
              {!agreed && <p className="checkout__note">Please agree to the terms above to enable payment.</p>}
            </>
          )}
        </div>

        <aside className="checkout__summary">
          <h2>Order</h2>
          <ul>
            {cart.items.map((i, idx) => (
              <li key={idx}>
                <span>
                  {i.title}{i.variantLabel ? ` (${i.variantLabel})` : ''} × {i.quantity}
                  {i.licenseTier && <small className="checkout__license"> · {licenseLabel(i.licenseTier)}</small>}
                </span>
                <span>{formatPrice(i.unitCents * i.quantity, i.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="checkout__summary-row">
            <span>Subtotal</span>
            <span>{formatPrice(cart.subtotalCents, cart.items[0]?.currency ?? 'USD')}</span>
          </div>
          {hasPhysical && <p className="checkout__note">+ shipping, calculated by PayPal at payment.</p>}
        </aside>
      </div>
    </div>
  )
}
