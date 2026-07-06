import { useEffect } from 'react'
import { Markdown } from './legal/Markdown'
import terms from './legal/terms.md?raw'
import licenses from './legal/licenses.md?raw'
import refund from './legal/refund.md?raw'
import privacy from './legal/privacy.md?raw'

const SECTIONS = [
  { id: 'terms', label: 'Terms', src: terms },
  { id: 'licenses', label: 'Licenses', src: licenses },
  { id: 'refund', label: 'Refunds', src: refund },
  { id: 'privacy', label: 'Privacy', src: privacy },
]

export function Terms() {
  // Scroll to the hash section on load (links point at /store/terms#licenses etc).
  useEffect(() => {
    const id = window.location.hash.replace('#', '')
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' })
  }, [])

  return (
    <div className="legal">
      <nav className="legal__toc" aria-label="Legal sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`}>{s.label}</a>
        ))}
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="legal__section">
          <Markdown source={s.src} />
        </section>
      ))}
    </div>
  )
}
