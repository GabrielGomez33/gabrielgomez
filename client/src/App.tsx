import './App.css'
import { Routes, Route } from 'react-router-dom'
import Portfolio from './pages/Portfolio'
import AdminApp from './admin/AdminApp'
import StoreApp from './store/StoreApp'
import { VerifyEmail } from './store/account/VerifyEmail'
import { ResetPassword } from './store/account/ResetPassword'
import { InstallPrompt } from './pwa/InstallPrompt'
import { UpdateBanner } from './pwa/UpdateBanner'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Portfolio />} />
        <Route path="/store/*" element={<StoreApp />} />
        <Route path="/admin/*" element={<AdminApp />} />
        {/* Reached from account emails (APP_URL/verify-email, /reset-password). */}
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
      {/* PWA: install invite + new-version reload prompt, on every route. */}
      <InstallPrompt />
      <UpdateBanner />
    </>
  )
}
