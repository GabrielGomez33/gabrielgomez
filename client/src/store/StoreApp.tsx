import './store.css'
import { Routes, Route, Navigate } from 'react-router-dom'
import { CartProvider } from './CartContext'
import { StoreNav } from './StoreNav'
import { CatalogView } from './CatalogView'
import { ProductDetail } from './ProductDetail'
import { Cart } from './Cart'
import { Checkout } from './Checkout'

export default function StoreApp() {
  return (
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
            <Route path="*" element={<Navigate to="music" replace />} />
          </Routes>
        </main>
      </div>
    </CartProvider>
  )
}
