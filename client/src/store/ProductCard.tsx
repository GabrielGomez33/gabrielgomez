import { Link } from 'react-router-dom'
import { formatPrice, type ProductSummary } from './storeApi'

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link to={`/store/product/${product.slug}`} className="pcard">
      <div className="pcard__media">
        {product.coverUrl ? (
          <img src={product.coverUrl} alt={product.title} loading="lazy" />
        ) : (
          <div className="pcard__placeholder" aria-hidden>
            {product.category === 'music' ? '♪' : '◻'}
          </div>
        )}
      </div>
      <div className="pcard__body">
        <div className="pcard__row">
          <h3 className="pcard__title">{product.title}</h3>
          <span className="pcard__price">{formatPrice(product.price_cents, product.currency)}</span>
        </div>
        {product.subtitle && <p className="pcard__sub">{product.subtitle}</p>}
        <span className="pcard__type">{product.type}</span>
      </div>
    </Link>
  )
}
