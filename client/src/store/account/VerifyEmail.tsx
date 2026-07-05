import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { accountApi } from './accountApi'
import './account.css'

type Status = 'working' | 'ok' | 'error'

export function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [status, setStatus] = useState<Status>('working')
  const [message, setMessage] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return // guard React 18 StrictMode double-invoke
    ran.current = true
    if (!token) {
      setStatus('error')
      setMessage('This verification link is missing its token.')
      return
    }
    accountApi
      .verifyEmail(token)
      .then(() => setStatus('ok'))
      .catch((err) => {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Verification failed.')
      })
  }, [token])

  return (
    <div className="acc-wrap acc-wrap--standalone">
      <div className="acc-card">
        {status === 'working' && <h1 className="acc-title">Verifying…</h1>}
        {status === 'ok' && (
          <>
            <h1 className="acc-title">Email verified ✓</h1>
            <p className="acc-sub">Thanks — your account is confirmed.</p>
            <Link to="/store/account" className="st__btn st__btn--primary acc-submit">Go to your account</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="acc-title">Verification failed</h1>
            <p className="acc-sub">{message}</p>
            <Link to="/store/account" className="st__btn acc-submit">Go to your account</Link>
          </>
        )}
      </div>
    </div>
  )
}
