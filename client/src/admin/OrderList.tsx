import { useEffect, useState } from 'react'
import { adminApi, type Order } from './adminApi'

function money(cents: number, currency: string): string {
  return cents > 0 ? `$${(cents / 100).toFixed(2)} ${currency}` : 'Free'
}
function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function OrderList() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  function load() {
    setLoading(true)
    adminApi
      .listOrders()
      .then((d) => setOrders(d.orders))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function refund(o: Order) {
    if (!confirm(`Refund order ${o.order_number} (${money(o.total_cents, o.currency)})? This reverses the payment and revokes downloads.`))
      return
    setBusyId(o.id)
    setError('')
    setMsg('')
    try {
      const r = await adminApi.refundOrder(o.id)
      setMsg(r.alreadyRefunded ? `Order ${o.order_number} was already refunded.` : `Refunded ${o.order_number}.`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refund failed.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="adm-muted">Loading…</p>

  return (
    <div>
      <div className="adm-list__head">
        <h2>Orders</h2>
        <button className="adm-btn" onClick={load}>Refresh</button>
      </div>
      {error && <p className="adm-error">{error}</p>}
      {msg && <p className="adm-ok">{msg}</p>}
      {orders.length === 0 ? (
        <p className="adm-muted">No orders yet.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Email</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.order_number}</td>
                <td>{fmtDate(o.paid_at || o.created_at)}</td>
                <td>{o.email}</td>
                <td>
                  {o.items.map((it, i) => (
                    <div key={i} className="adm-muted" style={{ fontSize: '0.8rem' }}>
                      {it.title_snapshot}
                      {it.license_tier ? ` · ${it.license_tier}` : ''} × {it.quantity}
                    </div>
                  ))}
                </td>
                <td>{money(o.total_cents, o.currency)}</td>
                <td>
                  <span className={`adm-badge adm-badge--${o.status === 'refunded' ? 'archived' : 'published'}`}>
                    {o.status}
                  </span>
                </td>
                <td>
                  {(o.status === 'paid' || o.status === 'fulfilled') && (
                    <button className="adm-btn adm-btn--danger" onClick={() => refund(o)} disabled={busyId === o.id}>
                      {busyId === o.id ? 'Refunding…' : 'Refund'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
