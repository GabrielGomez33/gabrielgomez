import './admin.css'
import { useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { getToken, adminApi } from './adminApi'
import { Login } from './Login'
import { ProductList } from './ProductList'
import { ProductEditor } from './ProductEditor'

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean>(Boolean(getToken()))
  const navigate = useNavigate()

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />
  }

  function logout() {
    adminApi.logout()
    setAuthed(false)
    navigate('/admin')
  }

  return (
    <div className="adm">
      <header className="adm__bar">
        <Link to="/admin" className="adm__brand">SonSoul · Admin</Link>
        <nav className="adm__nav">
          <Link to="/admin">Products</Link>
          <Link to="/admin/new">+ New</Link>
          <button className="adm__logout" onClick={logout}>Log out</button>
        </nav>
      </header>
      <main className="adm__main">
        <Routes>
          <Route index element={<ProductList />} />
          <Route path="new" element={<ProductEditor />} />
          <Route path=":id" element={<ProductEditor />} />
        </Routes>
      </main>
    </div>
  )
}
