// Bottom install bar. On Android/desktop it offers one-tap install; on iOS it
// shows the Add-to-Home-Screen instructions (iOS has no install API). Black/white
// aesthetic, safe-area aware. Mirrors Mirror's install UX.
import { useState } from 'react'
import { useInstallState } from './useInstallState'

const BAR: React.CSSProperties = {
  position: 'fixed',
  left: '50%',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
  transform: 'translateX(-50%)',
  zIndex: 9990,
  width: 'calc(100vw - 1.6rem)',
  maxWidth: 460,
}
const CARD: React.CSSProperties = {
  background: 'rgba(17,17,17,0.92)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(244,244,244,0.16)',
  borderRadius: 16,
  padding: '14px 14px 12px',
  color: '#f4f4f4',
  fontFamily: "'Inter', system-ui, sans-serif",
  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
}
const MONO: React.CSSProperties = {
  fontFamily: "'SFMono-Regular','JetBrains Mono',ui-monospace,monospace",
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

export function InstallPrompt() {
  const { canPromptInstall, shouldShowIOSTutorial, promptInstall, dismissPromptForever } = useInstallState()
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)

  if (hidden || (!canPromptInstall && !shouldShowIOSTutorial)) return null

  async function install() {
    setBusy(true)
    try {
      const outcome = await promptInstall()
      if (outcome !== 'unavailable') setHidden(true)
    } finally {
      setBusy(false)
    }
  }
  function dontAsk() {
    dismissPromptForever()
    setHidden(true)
  }

  return (
    <div style={BAR} role="dialog" aria-label="Install Gabriel Gomez">
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <img
            src="/GabrielGomez/pwa-192x192.png"
            alt=""
            aria-hidden
            width={42}
            height={42}
            style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 10 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>Add G.G to your home screen</p>
            {shouldShowIOSTutorial ? (
              <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#cfcfcf' }}>
                Tap the Share icon{' '}
                <span aria-hidden style={{ display: 'inline-block', transform: 'translateY(2px)' }}>
                  <ShareIcon />
                </span>{' '}
                then <b>Add to Home Screen</b>.
              </p>
            ) : (
              <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: '#cfcfcf' }}>
                Install for a full-screen app with offline access.
              </p>
            )}
          </div>
          <button onClick={() => setHidden(true)} aria-label="Dismiss" style={closeBtn}>
            ×
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          {canPromptInstall && (
            <button onClick={install} disabled={busy} style={primaryBtn(busy)}>
              {busy ? 'Installing…' : 'Install'}
            </button>
          )}
          <button onClick={dontAsk} style={{ ...MONO, ...textBtn, marginLeft: canPromptInstall ? 0 : 'auto' }}>
            Don't ask again
          </button>
        </div>
      </div>
    </div>
  )
}

const closeBtn: React.CSSProperties = {
  flexShrink: 0,
  background: 'transparent',
  border: 'none',
  color: 'rgba(244,244,244,0.5)',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  padding: '0 2px',
  marginTop: -2,
}
function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    ...MONO,
    flex: 1,
    padding: '10px 18px',
    borderRadius: 999,
    background: '#f4f4f4',
    color: '#0a0a0a',
    border: '1px solid #f4f4f4',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
    fontWeight: 600,
  }
}
const textBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(244,244,244,0.55)',
  cursor: 'pointer',
  padding: '8px 4px',
}

function ShareIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#cfcfcf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7" />
    </svg>
  )
}
