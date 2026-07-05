import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { accountApi, passwordIssues } from './accountApi'
import './account.css'

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pwIssues = useMemo(() => passwordIssues(password), [password])
  const canSubmit = Boolean(token) && pwIssues.length === 0 && password === confirm && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      await accountApi.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.')
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <div className="acc-wrap acc-wrap--standalone">
        <div className="acc-card">
          <h1 className="acc-title">Invalid link</h1>
          <p className="acc-sub">This reset link is missing its token. Request a new one.</p>
          <Link to="/store/account/forgot" className="st__btn acc-submit">Request a new link</Link>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="acc-wrap acc-wrap--standalone">
        <div className="acc-card">
          <h1 className="acc-title">Password updated</h1>
          <p className="acc-sub">You can now sign in with your new password.</p>
          <Link to="/store/account/login" className="st__btn st__btn--primary acc-submit">Sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="acc-wrap acc-wrap--standalone">
      <form className="acc-card" onSubmit={onSubmit} noValidate>
        <h1 className="acc-title">Set a new password</h1>
        <label className="acc-field">
          <span>New password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        {password.length > 0 && pwIssues.length > 0 && <p className="acc-hint">Needs {pwIssues.join(', ')}.</p>}
        <label className="acc-field">
          <span>Confirm password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </label>
        {confirm.length > 0 && confirm !== password && <p className="acc-hint">Passwords don’t match.</p>}
        {error && <p className="acc-error" role="alert">{error}</p>}
        <button className="st__btn st__btn--primary acc-submit" type="submit" disabled={!canSubmit}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
