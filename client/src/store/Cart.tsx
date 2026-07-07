import { Link } from 'react-router-dom'
import { useCart, itemKey } from './CartContext'
import { formatPrice, licenseLabel } from './storeApi'

export function Cart() {
  const cart = useCart()
  const currency = cart.items[0]?.currency ?? 'USD'

  if (cart.items.length === 0) {
    return (
      <div className="cartv cartv--empty">
        <p className="state--empty">Your cart is empty.</p>
        <Link to="/store/music" className="st__btn">Browse SonSoul</Link>
      </div>
    )
  }

  return (
    <div className="cartv">
      <h1 className="cartv__title">Cart</h1>
      <ul className="cartv__list">
        {cart.items.map((it) => {
          const key = itemKey(it)
          return (
            <li key={key} className="cartline">
              <div className="cartline__media">
                {it.coverUrl ? <img src={it.coverUrl} alt="" /> : <div className="cartline__ph">{it.isDigital ? '♪' : '◻'}</div>}
              </div>
              <div className="cartline__info">
                <span className="cartline__title">{it.title}</span>
                {it.variantLabel && <span className="cartline__variant">{it.variantLabel}</span>}
                {it.licenseTier && <span className="cartline__license">Licensed under {licenseLabel(it.licenseTier)}</span>}
                <span className="cartline__unit">{formatPrice(it.unitCents, it.currency)}</span>
              </div>
              <div className="cartline__controls">
                {!it.isDigital && (
                  <div className="pdetail__qty">
                    <button onClick={() => cart.setQty(key, it.quantity - 1)} aria-label="Decrease">−</button>
                    <span>{it.quantity}</span>
                    <button onClick={() => cart.setQty(key, it.quantity + 1)} aria-label="Increase">+</button>
                  </div>
                )}
                <span className="cartline__line">{formatPrice(it.unitCents * it.quantity, it.currency)}</span>
                <button className="cartline__remove" onClick={() => cart.remove(key)} aria-label="Remove">×</button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="cartv__foot">
        <div className="cartv__totals">
          <span>Subtotal</span>
          <span>{formatPrice(cart.subtotalCents, currency)}</span>
        </div>
        <p className="cartv__note">Shipping &amp; taxes calculated at checkout.</p>
        <Link to="/store/checkout" className="st__btn st__btn--primary cartv__checkout">Checkout</Link>
        <button className="st__btn cartv__clear" onClick={() => cart.clear()}>Clear cart</button>
      </div>
    </div>
  )
}
