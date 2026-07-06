// Shown at the bottom when a new service worker is waiting. Tapping "Reload"
// activates it and refreshes to the new shell. Uses vite-plugin-pwa's React
// register hook (registerType: 'prompt'). Mirrors Mirror's UpdateBanner.
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      console.error('[PWA] service worker registration failed:', err)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100vw - 1.6rem)',
        maxWidth: 460,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(17,17,17,0.94)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(244,244,244,0.16)',
          borderRadius: 16,
          padding: '12px 14px',
          color: '#f4f4f4',
          fontFamily: "'Inter', system-ui, sans-serif",
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 500, fontSize: 13.5 }}>A new version is ready</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#cfcfcf' }}>Reload to get the latest.</p>
        </div>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            flexShrink: 0,
            fontFamily: "'SFMono-Regular','JetBrains Mono',ui-monospace,monospace",
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 600,
            padding: '9px 16px',
            borderRadius: 999,
            background: '#f4f4f4',
            color: '#0a0a0a',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss"
          style={{
            flexShrink: 0,
            background: 'transparent',
            border: 'none',
            color: 'rgba(244,244,244,0.5)',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
