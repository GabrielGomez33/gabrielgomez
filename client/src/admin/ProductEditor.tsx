import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi, type Product, type AttrOption, type Variant } from './adminApi'

const TYPES: Record<string, string[]> = {
  music: ['beatpack', 'single', 'album'],
  clothing: ['shirt', 'pants', 'socks'],
  accessory: ['accessory', 'hat', 'bag', 'other'],
}
const TIERS = ['mp3', 'wav', 'stems', 'exclusive'] as const

function fmtSecs(s: number | null): string {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
function fmtBytes(b: number | null): string {
  if (!b) return '—'
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`
}

export function ProductEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)

  const [product, setProduct] = useState<Product | null>(null)
  const [options, setOptions] = useState<AttrOption[]>([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Basic form
  const [category, setCategory] = useState<'music' | 'clothing' | 'accessory'>('music')
  const [type, setType] = useState('beatpack')
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')

  // Music meta
  const [genre, setGenre] = useState('')
  const [style, setStyle] = useState('')
  const [notes, setNotes] = useState('')

  const folderRef = useRef<HTMLInputElement>(null)

  const opts = (kind: string) => options.filter((o) => o.kind === kind)

  useEffect(() => {
    adminApi.options().then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    if (folderRef.current) {
      folderRef.current.setAttribute('webkitdirectory', '')
      folderRef.current.setAttribute('directory', '')
    }
  }, [product])

  const loadProduct = useMemo(
    () => async () => {
      if (!id) return
      const { product: p } = await adminApi.getProduct(Number(id))
      setProduct(p)
      setCategory(p.category)
      setType(p.type)
      setTitle(p.title)
      setSubtitle(p.subtitle ?? '')
      setDescription(p.description ?? '')
      setPrice((p.price_cents / 100).toFixed(2))
      const mm = p.musicMeta as { genre?: string; style?: string; notes?: string } | null
      setGenre(mm?.genre ?? '')
      setStyle(mm?.style ?? '')
      setNotes(mm?.notes ?? '')
    },
    [id],
  )

  useEffect(() => {
    loadProduct().catch((e) => setError(e instanceof Error ? e.message : 'Load failed.'))
  }, [loadProduct])

  async function saveBasic(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const priceCents = Math.round((parseFloat(price) || 0) * 100)
      if (editing) {
        await adminApi.updateProduct(Number(id), { title, subtitle, description, priceCents })
        if (category === 'music') await adminApi.setMusicMeta(Number(id), { genre, style, notes })
        setMsg('Saved.')
        await loadProduct()
      } else {
        const { product: p } = await adminApi.createProduct({
          category,
          type,
          title,
          subtitle,
          description,
          priceCents,
          ...(category === 'music' ? { genre, style, notes } : {}),
        })
        navigate(`/admin/${p.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAudio(files: FileList | null) {
    if (!files || !id || files.length === 0) return
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await adminApi.uploadAudio(Number(id), Array.from(files), { genre, style })
      setMsg('Audio uploaded — previews + waveforms generated.')
      await loadProduct()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (folderRef.current) folderRef.current.value = ''
    }
  }

  async function handleCover(file: File | undefined) {
    if (!file || !id) return
    setBusy(true)
    try {
      await adminApi.uploadCover(Number(id), file)
      setMsg('Cover uploaded.')
      await loadProduct()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cover failed.')
    } finally {
      setBusy(false)
    }
  }

  async function doPublish() {
    if (!id) return
    setBusy(true)
    try {
      const r = await adminApi.publish(Number(id))
      setMsg(r.paypalWarning ? `Published. Note: ${r.paypalWarning}` : 'Published + PayPal product created.')
      await loadProduct()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed.')
    } finally {
      setBusy(false)
    }
  }

  async function doDelete() {
    if (!id || !confirm('Delete this product and its files?')) return
    await adminApi.deleteProduct(Number(id))
    navigate('/admin')
  }

  const isMusic = category === 'music'

  return (
    <div className="adm-editor">
      <div className="adm-list__head">
        <h2>{editing ? title || 'Edit product' : 'New product'}</h2>
        {product && <span className={`adm-badge adm-badge--${product.status}`}>{product.status}</span>}
      </div>

      {error && <p className="adm-error">{error}</p>}
      {msg && <p className="adm-ok">{msg}</p>}

      <form className="adm-form" onSubmit={saveBasic}>
        <div className="adm-grid2">
          <label className="adm-field">
            <span>Category</span>
            <select
              value={category}
              disabled={editing}
              onChange={(e) => {
                const c = e.target.value as typeof category
                setCategory(c)
                setType(TYPES[c][0])
              }}
            >
              <option value="music">Music</option>
              <option value="clothing">Clothing</option>
              <option value="accessory">Accessory</option>
            </select>
          </label>
          <label className="adm-field">
            <span>Type</span>
            <select value={type} disabled={editing} onChange={(e) => setType(e.target.value)}>
              {TYPES[category].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="adm-field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="adm-field">
          <span>Subtitle</span>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>Description</span>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>Price (USD)</span>
          <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>

        {isMusic && (
          <div className="adm-grid2">
            <label className="adm-field">
              <span>Genre</span>
              <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                <option value="">—</option>
                {opts('genre').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="adm-field">
              <span>Style</span>
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="">—</option>
                {opts('music_style').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        {isMusic && (
          <label className="adm-field">
            <span>Notes</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        )}

        <button className="adm-btn adm-btn--primary" type="submit" disabled={busy}>
          {editing ? 'Save changes' : 'Create product'}
        </button>
      </form>

      {editing && product && (
        <>
          {/* Cover */}
          <section className="adm-section">
            <h3>Cover image</h3>
            <input type="file" accept="image/*" onChange={(e) => handleCover(e.target.files?.[0])} />
            {product.cover_image_path && <p className="adm-muted">Current: {product.cover_image_path}</p>}
          </section>

          {/* Music: audio upload + tracks + tiers */}
          {isMusic && (
            <>
              <section className="adm-section">
                <h3>Audio — upload files or a whole folder</h3>
                <div className="adm-uploads">
                  <label className="adm-drop">
                    <span>Select files</span>
                    <input type="file" accept="audio/*" multiple onChange={(e) => handleAudio(e.target.files)} />
                  </label>
                  <label className="adm-drop">
                    <span>Select a folder</span>
                    <input ref={folderRef} type="file" multiple onChange={(e) => handleAudio(e.target.files)} />
                  </label>
                </div>
                {busy && <p className="adm-muted">Processing (ffprobe + preview + waveform)…</p>}
              </section>

              <section className="adm-section">
                <h3>Tracks ({product.tracks?.length ?? 0})</h3>
                {product.tracks && product.tracks.length > 0 ? (
                  <table className="adm-table">
                    <thead>
                      <tr><th>#</th><th>Name</th><th>Length</th><th>Format</th><th>Bitrate</th><th>Size</th><th>Preview</th></tr>
                    </thead>
                    <tbody>
                      {product.tracks.map((t) => (
                        <tr key={t.id}>
                          <td>{t.position}</td>
                          <td>{t.name}</td>
                          <td>{fmtSecs(t.length_sec)}</td>
                          <td>{t.format ?? '—'}</td>
                          <td>{t.bitrate_kbps ? `${t.bitrate_kbps}k` : '—'}</td>
                          <td>{fmtBytes(t.file_size_bytes)}</td>
                          <td>{t.preview_path ? '✓' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="adm-muted">No tracks yet.</p>
                )}
              </section>

              <TierEditor productId={product.id} tiers={product.licenseTiers ?? []} onDone={loadProduct} />
            </>
          )}

          {/* Clothing/accessory: variants */}
          {!isMusic && <VariantEditor productId={product.id} variants={product.variants ?? []} options={options} onDone={loadProduct} />}

          {/* Actions */}
          <section className="adm-section adm-actions">
            <button className="adm-btn adm-btn--primary" onClick={doPublish} disabled={busy}>Publish</button>
            <button className="adm-btn adm-btn--danger" onClick={doDelete} disabled={busy}>Delete</button>
          </section>
        </>
      )}
    </div>
  )
}

function TierEditor({
  productId,
  tiers,
  onDone,
}: {
  productId: number
  tiers: Array<Record<string, unknown>>
  onDone: () => Promise<void>
}) {
  const [tier, setTier] = useState<string>('mp3')
  const [price, setPrice] = useState('')
  async function add() {
    await adminApi.addTier(productId, tier, Math.round((parseFloat(price) || 0) * 100))
    setPrice('')
    await onDone()
  }
  return (
    <section className="adm-section">
      <h3>License tiers (optional)</h3>
      {tiers.length > 0 && (
        <ul className="adm-inline-list">
          {tiers.map((t, i) => (
            <li key={i}>{String(t.tier)} — ${((Number(t.price_cents) || 0) / 100).toFixed(2)}</li>
          ))}
        </ul>
      )}
      <div className="adm-inline">
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          {TIERS.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <input type="number" step="0.01" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="adm-btn" onClick={add}>Add tier</button>
      </div>
    </section>
  )
}

function VariantEditor({
  productId,
  variants,
  options,
  onDone,
}: {
  productId: number
  variants: Variant[]
  options: AttrOption[]
  onDone: () => Promise<void>
}) {
  const [size, setSize] = useState('')
  const [color, setColor] = useState('')
  const [style, setStyle] = useState('')
  const [stock, setStock] = useState('0')
  const [delta, setDelta] = useState('0')
  const opts = (kind: string) => options.filter((o) => o.kind === kind)

  async function add() {
    await adminApi.addVariant(productId, {
      size: size || null,
      color: color || null,
      style: style || null,
      stockQty: parseInt(stock, 10) || 0,
      priceDeltaCents: Math.round((parseFloat(delta) || 0) * 100),
    })
    setSize(''); setColor(''); setStyle(''); setStock('0'); setDelta('0')
    await onDone()
  }

  return (
    <section className="adm-section">
      <h3>Variants ({variants.length})</h3>
      {variants.length > 0 && (
        <table className="adm-table">
          <thead><tr><th>Size</th><th>Color</th><th>Style</th><th>Stock</th><th>+Price</th></tr></thead>
          <tbody>
            {variants.map((v, i) => (
              <tr key={i}>
                <td>{String(v.size ?? '—')}</td>
                <td>{String(v.color ?? '—')}</td>
                <td>{String(v.style ?? '—')}</td>
                <td>{String(v.stock_qty ?? 0)}</td>
                <td>${((Number(v.price_delta_cents) || 0) / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="adm-inline">
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">Size</option>
          {opts('size').map((o) => (<option key={o.value} value={o.label}>{o.label}</option>))}
        </select>
        <select value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">Color</option>
          {opts('color').map((o) => (<option key={o.value} value={o.label}>{o.label}</option>))}
        </select>
        <select value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="">Style</option>
          {opts('style').map((o) => (<option key={o.value} value={o.label}>{o.label}</option>))}
        </select>
        <input type="number" min="0" placeholder="Stock" value={stock} onChange={(e) => setStock(e.target.value)} />
        <input type="number" step="0.01" placeholder="+Price" value={delta} onChange={(e) => setDelta(e.target.value)} />
        <button className="adm-btn" onClick={add}>Add variant</button>
      </div>
    </section>
  )
}
