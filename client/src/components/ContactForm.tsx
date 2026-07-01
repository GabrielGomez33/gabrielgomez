import { useEffect, useMemo, useState } from 'react'
import { sendContact } from '../services/contactApi'

const MAX_SUBJECT = 200
const MAX_MESSAGE = 5000

function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim().toLowerCase())
}

type Status = 'idle' | 'sending' | 'sent' | 'error'

export function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [retryIn, setRetryIn] = useState(0)

  // Countdown for rate-limit (429) responses.
  useEffect(() => {
    if (retryIn <= 0) return
    const t = setTimeout(() => setRetryIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [retryIn])

  const validation = useMemo(() => {
    const issues: string[] = []
    if (!name.trim()) issues.push('name')
    if (!validEmail(email)) issues.push('email')
    if (!subject.trim()) issues.push('subject')
    if (message.trim().length < 5) issues.push('message')
    return { ok: issues.length === 0, issues }
  }, [name, email, subject, message])

  const disabled = status === 'sending' || retryIn > 0

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validation.ok || disabled) return
    setStatus('sending')
    setError('')
    const result = await sendContact({ name, email, subject, message, website })
    if (result.ok) {
      setStatus('sent')
      return
    }
    setStatus('error')
    setError(result.error ?? 'Something went wrong.')
    if (result.retryAfterSec && result.retryAfterSec > 0) setRetryIn(result.retryAfterSec)
  }

  if (status === 'sent') {
    return (
      <div className="cform cform--sent" role="status">
        <span className="cform__check" aria-hidden>&#10003;</span>
        <p className="cform__sent-title">Message sent</p>
        <p className="cform__sent-body">Thanks for reaching out — I&rsquo;ll get back to you soon.</p>
        <button
          type="button"
          className="cform__submit"
          onClick={() => {
            setName(''); setEmail(''); setSubject(''); setMessage(''); setStatus('idle')
          }}
        >
          Send another
        </button>
      </div>
    )
  }

  return (
    <form className="cform" onSubmit={onSubmit} noValidate>
      <div className="cform__row">
        <label className="cform__field">
          <span className="cform__label">Name</span>
          <input
            className="cform__input"
            type="text"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className="cform__field">
          <span className="cform__label">Email</span>
          <input
            className="cform__input"
            type="email"
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
      </div>

      <label className="cform__field">
        <span className="cform__label">Subject</span>
        <input
          className="cform__input"
          type="text"
          value={subject}
          maxLength={MAX_SUBJECT}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>

      <label className="cform__field">
        <span className="cform__label">
          Message <span className="cform__count">{message.length}/{MAX_MESSAGE}</span>
        </span>
        <textarea
          className="cform__input cform__textarea"
          value={message}
          maxLength={MAX_MESSAGE}
          rows={5}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>

      {/* Honeypot: visually hidden, off-screen; bots fill it, humans don't. */}
      <div className="cform__hp" aria-hidden>
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {status === 'error' && (
        <p className="cform__error" role="alert">
          {error}
          {retryIn > 0 && <> — retry in {retryIn}s</>}
        </p>
      )}

      <button className="cform__submit" type="submit" disabled={disabled || !validation.ok}>
        {status === 'sending' ? 'Sending…' : retryIn > 0 ? `Wait ${retryIn}s` : 'Send message'}
      </button>
    </form>
  )
}
