import { useEffect, useRef, useState } from 'react'
import { formatSecs } from './storeApi'

// Smooth, flowing multi-line waveform (dark bg, luminous white lines) with a
// gated 10s preview. Robust to expired tokens, load failures, and no-peaks data.
interface Props {
  previewUrl: string | null
  peaks: number[] | null
  onNeedFreshUrl?: () => Promise<string | null> // re-fetch a signed URL if the token expired
}

export function WaveformPlayer({ previewUrl, peaks, onNeedFreshUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0) // 0..1
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const data = peaks && peaks.length ? peaks : null

  // Draw the waveform whenever peaks or progress change.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const mid = h / 2
    const pts = data ?? new Array(120).fill(0)
    const n = pts.length
    const step = w / (n - 1)

    // Three faintly offset passes give the layered, flowing look.
    const layers = [
      { scale: 1.0, alpha: 0.95, off: 0 },
      { scale: 0.82, alpha: 0.5, off: 3 },
      { scale: 0.66, alpha: 0.3, off: -3 },
    ]
    for (const layer of layers) {
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const x = i * step
        const amp = pts[i] * (mid - 6) * layer.scale
        const y = mid - amp + layer.off
        if (i === 0) ctx.moveTo(x, y)
        else {
          const px = (i - 1) * step
          const cx = (px + x) / 2
          ctx.quadraticCurveTo(px, mid - pts[i - 1] * (mid - 6) * layer.scale + layer.off, cx, y)
        }
      }
      // mirror for the bottom half
      for (let i = n - 1; i >= 0; i--) {
        const x = i * step
        const amp = pts[i] * (mid - 6) * layer.scale
        ctx.lineTo(x, mid + amp + layer.off)
      }
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, `rgba(244,244,244,${layer.alpha})`)
      grad.addColorStop(Math.max(0.001, progress), `rgba(244,244,244,${layer.alpha})`)
      grad.addColorStop(Math.min(0.999, progress + 0.001), `rgba(120,120,120,${layer.alpha * 0.5})`)
      grad.addColorStop(1, `rgba(120,120,120,${layer.alpha * 0.5})`)
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
  }, [data, progress])

  function ensureAudio(url: string): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio()
      a.preload = 'none'
      a.addEventListener('timeupdate', () => {
        setCurrent(a.currentTime)
        if (a.duration) setProgress(a.currentTime / a.duration)
      })
      a.addEventListener('loadedmetadata', () => setDuration(a.duration || 0))
      a.addEventListener('ended', () => {
        setPlaying(false)
        setProgress(0)
      })
      a.addEventListener('error', () => {
        setError('Preview unavailable.')
        setPlaying(false)
        setLoading(false)
      })
      audioRef.current = a
    }
    audioRef.current.src = url
    return audioRef.current
  }

  async function toggle() {
    setError('')
    const a = audioRef.current
    if (playing && a) {
      a.pause()
      setPlaying(false)
      return
    }
    let url = previewUrl
    if (!url) {
      setError('No preview available.')
      return
    }
    setLoading(true)
    try {
      const audio = ensureAudio(url)
      try {
        await audio.play()
      } catch {
        // Token may have expired — try to refresh once.
        if (onNeedFreshUrl) {
          const fresh = await onNeedFreshUrl()
          if (fresh) {
            url = fresh
            audio.src = fresh
            await audio.play()
          } else {
            throw new Error('expired')
          }
        } else {
          throw new Error('expired')
        }
      }
      setPlaying(true)
    } catch {
      setError('Could not play preview. Try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Clean up audio on unmount.
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  return (
    <div className="wf">
      <button
        className={`wf__btn ${playing ? 'is-playing' : ''}`}
        onClick={toggle}
        aria-label={playing ? 'Pause preview' : 'Play preview'}
        disabled={loading}
      >
        {loading ? '…' : playing ? '❚❚' : '▶'}
      </button>
      <span className="wf__time">{formatSecs(current)}</span>
      <canvas ref={canvasRef} className="wf__canvas" />
      <span className="wf__time">{formatSecs(duration || 10)}</span>
      {error && <span className="wf__err" role="alert">{error}</span>}
    </div>
  )
}
