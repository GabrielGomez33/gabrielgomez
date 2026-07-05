import { useState } from 'react'
import { Link } from 'react-router-dom'
import { accountApi, validEmail } from './accountApi'

export function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validEmail(email) || busy) return
    setBusy(true)
    setError('')
    try {
      await accountApi.forgotPassword(email.trim().toLowerCase())
      setSent(true) // generic — the server never reveals whether the email exists
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="acc-wrap">
        <div className="acc-card">
          <h1 className="acc-title">Check your email</h1>
          <p className="acc-sub">If an account exists for that address, a password-reset link is on its way. It expires in 1 hour.</p>
          <Link to="/store/account/login" className="st__btn acc-submit">Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="acc-wrap">
      <form className="acc-card" onSubmit={onSubmit} noValidate>
        <h1 className="acc-title">Reset password</h1>
        <p className="acc-sub">Enter your email and we’ll send a reset link.</p>
        <label className="acc-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        {error && <p className="acc-error" role="alert">{error}</p>}
        <button className="st__btn st__btn--primary acc-submit" type="submit" disabled={!validEmail(email) || busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
        <div className="acc-links"><Link to="/store/account/login">Back to sign in</Link></div>
      </form>
    </div>
  )
}
