import './store.css'
import './account/account.css'
import { Routes, Route, Navigate } from 'react-router-dom'
import { CartProvider } from './CartContext'
import { AccountProvider } from './account/AccountContext'
import { StoreNav } from './StoreNav'
import { CatalogView } from './CatalogView'
import { ProductDetail } from './ProductDetail'
import { Cart } from './Cart'
import { Checkout } from './Checkout'
import { Login } from './account/Login'
import { Register } from './account/Register'
import { Forgot } from './account/Forgot'
import { Dashboard } from './account/Dashboard'
import { Terms } from './Terms'
import { Link } from 'react-router-dom'

export default function StoreApp() {
  return (
    <AccountProvider>
      <CartProvider>
        <div className="st">
          <StoreNav />
          <main className="st__main">
            <Routes>
              <Route index element={<Navigate to="music" replace />} />
              <Route path="music" element={<CatalogView category="music" />} />
              <Route path="clothing" element={<CatalogView category="clothing" />} />
              <Route path="accessories" element={<CatalogView category="accessory" />} />
              <Route path="product/:slug" element={<ProductDetail />} />
              <Route path="cart" element={<Cart />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="terms" element={<Terms />} />
              <Route path="account" element={<Dashboard />} />
              <Route path="account/login" element={<Login />} />
              <Route path="account/register" element={<Register />} />
              <Route path="account/forgot" element={<Forgot />} />
              <Route path="*" element={<Navigate to="music" replace />} />
            </Routes>
          </main>
          <footer className="st__footer">
            <span>© {new Date().getFullYear()} SonSoul · Gabriel Elyth Gomez</span>
            <nav className="st__footer-links">
              <Link to="/store/terms">Terms</Link>
              <Link to="/store/terms#licenses">Licenses</Link>
              <Link to="/store/terms#refund">Refunds</Link>
              <Link to="/store/terms#privacy">Privacy</Link>
            </nav>
          </footer>
        </div>
      </CartProvider>
    </AccountProvider>
  )
}
