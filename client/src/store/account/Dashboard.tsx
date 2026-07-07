import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount } from './AccountContext'
import { accountApi, ApiError, type Order, type DownloadItem } from './accountApi'
import { formatPrice, licenseLabel } from '../storeApi'

export function Dashboard() {
  const { customer, loading, logout } = useAccount()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [downloads, setDownloads] = useState<DownloadItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading) return
    if (!customer) {
      navigate('/store/account/login', { replace: true })
      return
    }
    let alive = true
    Promise.all([accountApi.orders(), accountApi.downloads()])
      .then(([o, d]) => {
        if (!alive) return
        setOrders(o.orders)
        setDownloads(d.downloads)
      })
      .catch((err) => {
        if (!alive) return
        // Session expired mid-session → back to login.
        if (err instanceof ApiError && err.status === 401) {
          logout()
          navigate('/store/account/login', { replace: true })
          return
        }
        setError(err instanceof Error ? err.message : 'Could not load your account.')
      })
    return () => {
      alive = false
    }
  }, [customer, loading, navigate, logout])

  if (loading) return <div className="state">Loading…</div>
  if (!customer) return null

  return (
    <div className="acc-dash">
      <div className="acc-dash__head">
        <div>
          <h1 className="acc-dash__title">Your account</h1>
          <p className="acc-dash__email">
            {customer.name ? `${customer.name} · ` : ''}{customer.email}
            {customer.emailVerified === false || customer.email_verified === 0 ? (
              <span className="acc-badge acc-badge--warn">unverified</span>
            ) : (
              <span className="acc-badge">verified</span>
            )}
          </p>
        </div>
        <button className="st__btn" onClick={() => { logout(); navigate('/store/music') }}>Sign out</button>
      </div>

      {error && <p className="acc-error" role="alert">{error}</p>}

      <section className="acc-section">
        <h2>Downloads</h2>
        {!downloads && !error && <p className="state">Loading…</p>}
        {downloads && downloads.length === 0 && <p className="state--empty">No downloads yet.</p>}
        {downloads && downloads.length > 0 && (
          <ul className="acc-downloads">
            {downloads.map((d, i) => (
              <li key={i}>
                <div>
                  <span className="acc-dl__title">{d.title}</span>
                  <span className="acc-dl__meta">
                    {d.orderNumber} · {d.remaining} download{d.remaining === 1 ? '' : 's'} left ·
                    expires {new Date(d.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                {d.remaining > 0 ? (
                  <a className="st__btn st__btn--primary" href={d.url}>Download</a>
                ) : (
                  <span className="acc-dl__spent">limit reached</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="acc-section">
        <h2>Order history</h2>
        {!orders && !error && <p className="state">Loading…</p>}
        {orders && orders.length === 0 && (
          <p className="state--empty">No orders yet. <Link to="/store/music" className="acc-inline-link">Browse SonSoul</Link>.</p>
        )}
        {orders && orders.length > 0 && (
          <ul className="acc-orders">
            {orders.map((o) => (
              <li key={o.id} className="acc-order">
                <div className="acc-order__head">
                  <span className="acc-order__num">{o.order_number}</span>
                  <span className={`acc-badge acc-badge--${o.status}`}>{o.status}</span>
                  <span className="acc-order__date">{new Date(o.created_at).toLocaleDateString()}</span>
                  <span className="acc-order__total">{formatPrice(o.total_cents, o.currency)}</span>
                </div>
                <ul className="acc-order__items">
                  {o.items.map((it, i) => (
                    <li key={i}>
                      {it.title_snapshot} × {it.quantity}
                      {it.license_tier && (
                        <span className="acc-order__license"> · Licensed under {licenseLabel(it.license_tier)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
