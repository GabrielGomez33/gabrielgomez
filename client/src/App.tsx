import './App.css'
import { Routes, Route } from 'react-router-dom'
import Portfolio from './pages/Portfolio'
import AdminApp from './admin/AdminApp'
import StoreApp from './store/StoreApp'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Portfolio />} />
      <Route path="/store/*" element={<StoreApp />} />
      <Route path="/admin/*" element={<AdminApp />} />
    </Routes>
  )
}
