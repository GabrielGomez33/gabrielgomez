import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount } from './AccountContext'
import { validEmail } from './accountApi'

export function Login() {
  const { login } = useAccount()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canSubmit = validEmail(email) && password.length > 0 && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      await login(email.trim().toLowerCase(), password)
      navigate('/store/account')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acc-wrap">
      <form className="acc-card" onSubmit={onSubmit} noValidate>
        <h1 className="acc-title">Sign in</h1>
        <label className="acc-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="acc-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <p className="acc-error" role="alert">{error}</p>}
        <button className="st__btn st__btn--primary acc-submit" type="submit" disabled={!canSubmit}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="acc-links">
          <Link to="/store/account/forgot">Forgot password?</Link>
          <Link to="/store/account/register">Create an account</Link>
        </div>
      </form>
    </div>
  )
}
