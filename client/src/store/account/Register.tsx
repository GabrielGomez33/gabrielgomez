import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount } from './AccountContext'
import { passwordIssues, validEmail } from './accountApi'

export function Register() {
  const { register } = useAccount()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [optIn, setOptIn] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pwIssues = useMemo(() => passwordIssues(password), [password])
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit = validEmail(email) && pwIssues.length === 0 && password === confirm && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      await register({ email: email.trim().toLowerCase(), password, name: name.trim() || undefined, marketingOptIn: optIn })
      navigate('/store/account')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acc-wrap">
      <form className="acc-card" onSubmit={onSubmit} noValidate>
        <h1 className="acc-title">Create account</h1>
        <label className="acc-field">
          <span>Name <span className="acc-optional">(optional)</span></span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="acc-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="acc-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {password.length > 0 && pwIssues.length > 0 && (
          <p className="acc-hint">Needs {pwIssues.join(', ')}.</p>
        )}
        <label className="acc-field">
          <span>Confirm password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {mismatch && <p className="acc-hint">Passwords don’t match.</p>}
        <label className="acc-check">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
          <span>Email me new drops &amp; releases</span>
        </label>
        {error && <p className="acc-error" role="alert">{error}</p>}
        <button className="st__btn st__btn--primary acc-submit" type="submit" disabled={!canSubmit}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <div className="acc-links">
          <Link to="/store/account/login">Already have an account? Sign in</Link>
        </div>
      </form>
    </div>
  )
}
