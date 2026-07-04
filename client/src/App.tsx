import './App.css'
import { Routes, Route } from 'react-router-dom'
import Portfolio from './pages/Portfolio'
import AdminApp from './admin/AdminApp'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Portfolio />} />
      <Route path="/admin/*" element={<AdminApp />} />
    </Routes>
  )
}
