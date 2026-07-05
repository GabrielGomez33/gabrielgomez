import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, type Product } from './adminApi'

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    adminApi
      .listProducts()
      .then((d) => setProducts(d.products))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="adm-muted">Loading…</p>
  if (error) return <p className="adm-error">{error}</p>

  return (
    <div>
      <div className="adm-list__head">
        <h2>Products</h2>
        <Link to="/admin/new" className="adm-btn adm-btn--primary">+ New product</Link>
      </div>
      {products.length === 0 ? (
        <p className="adm-muted">No products yet. Create your first one.</p>
      ) : (
        <table className="adm-table">
          <thead>
            <tr>
              <th></th>
              <th>Title</th>
              <th>Category</th>
              <th>Type</th>
              <th>Price</th>
              <th>Status</th>
              <th>PayPal</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td className="adm-thumb-cell">
                  {p.coverThumbUrl ? (
                    <img className="adm-thumb" src={p.coverThumbUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="adm-thumb adm-thumb--empty" aria-hidden>
                      {p.category === 'music' ? '♪' : '◻'}
                    </span>
                  )}
                </td>
                <td>
                  <Link to={`/admin/${p.id}`}>{p.title}</Link>
                </td>
                <td>{p.category}</td>
                <td>{p.type}</td>
                <td>{p.price_cents > 0 ? `$${(p.price_cents / 100).toFixed(2)}` : 'Free'}</td>
                <td>
                  <span className={`adm-badge adm-badge--${p.status}`}>{p.status}</span>
                </td>
                <td>{p.paypal_product_id ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
