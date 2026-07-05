import { NavLink, Link } from 'react-router-dom'
import { useCart } from './CartContext'
import { useAccount } from './account/AccountContext'

const TABS = [
  { to: '/store/music', label: 'Music' },
  { to: '/store/clothing', label: 'Clothing' },
  { to: '/store/accessories', label: 'Accessories' },
]

export function StoreNav() {
  const { count } = useCart()
  const { customer } = useAccount()
  return (
    <header className="st__nav">
      <div className="st__nav-inner">
        <Link to="/" className="st__brand" aria-label="Back to portfolio">SonSoul</Link>
        <nav className="st__tabs">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `st__tab ${isActive ? 'is-active' : ''}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="st__nav-right">
          <Link to={customer ? '/store/account' : '/store/account/login'} className="st__account">
            {customer ? (customer.name || 'Account') : 'Sign in'}
          </Link>
          <Link to="/store/cart" className="st__cart" aria-label={`Cart, ${count} items`}>
            Cart{count > 0 && <span className="st__cart-badge">{count}</span>}
          </Link>
        </div>
      </div>
    </header>
  )
}
