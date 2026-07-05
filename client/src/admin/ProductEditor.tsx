import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi, type Product, type AttrOption, type Variant } from './adminApi'

const TYPES: Record<string, string[]> = {
  music: ['beatpack', 'single', 'album', 'samplepack'],
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
function kindLabel(k: string | null): string {
  return k === 'one_shot' ? 'one-shot' : k === 'instrumental' ? 'beat' : k === 'loop' ? 'loop' : '—'
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
        await loadProduct().catch(() => {})
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
      const r = await adminApi.uploadAudio(Number(id), Array.from(files), { genre, style })
      const n = r.added?.length ?? 0
      setMsg(
        r.isSamplePack
          ? `${n} sample${n === 1 ? '' : 's'} added, analyzed & sorted. Preview set: ${r.previewCount ?? 0}.`
          : 'Audio uploaded — previews + waveforms generated.',
      )
      await loadProduct().catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (folderRef.current) folderRef.current.value = ''
    }
  }

  async function handleReanalyze() {
    if (!id) return
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const r = await adminApi.reanalyze(Number(id))
      setMsg(`Re-analyzed ${r.analyzed} track${r.analyzed === 1 ? '' : 's'} — ${r.previews} preview${r.previews === 1 ? '' : 's'} rebuilt.`)
      await loadProduct().catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-analyze failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteTrack(trackId: number) {
    if (!id || !confirm('Delete this track and its files?')) return
    setBusy(true)
    setError('')
    setMsg('')
    try {
      await adminApi.deleteTrack(Number(id), trackId)
      setMsg('Track deleted.')
      await loadProduct().catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCover(file: File | undefined) {
    if (!file || !id) return
    setBusy(true)
    try {
      await adminApi.uploadCover(Number(id), file)
      setMsg('Cover uploaded.')
      await loadProduct().catch(() => {})
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
      await loadProduct().catch(() => {})
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
  const isSamplePack = isMusic && type === 'samplepack'

  // All metadata fields are mandatory. Music additionally needs genre/style/notes.
  const basicComplete = Boolean(
    title.trim() &&
      subtitle.trim() &&
      description.trim() &&
      parseFloat(price) > 0 &&
      (!isMusic || (genre && style)),
  )
  // Publishing additionally requires a cover and real content.
  const hasCover = Boolean(product?.cover_image_path)
  const hasContent = isMusic ? Boolean(product?.tracks?.length) : Boolean(product?.variants?.length)
  const hasPreviewSample = Boolean(product?.tracks?.some((t) => t.is_preview))
  const publishMissing: string[] = []
  if (!basicComplete) publishMissing.push('all fields filled in')
  if (!hasCover) publishMissing.push('a cover image')
  if (!hasContent) publishMissing.push(isSamplePack ? 'at least one sample' : isMusic ? 'at least one track' : 'at least one variant')
  if (isSamplePack && hasContent && !hasPreviewSample) publishMissing.push('a preview set (Auto-pick previews)')
  const canPublish = publishMissing.length === 0

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
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} required />
        </label>
        <label className="adm-field">
          <span>Description</span>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        <label className="adm-field">
          <span>Price (USD)</span>
          <input type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>

        {isMusic && (
          <div className="adm-grid2">
            <label className="adm-field">
              <span>Genre</span>
              <select value={genre} onChange={(e) => setGenre(e.target.value)} required>
                <option value="">—</option>
                {opts('genre').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="adm-field">
              <span>Style</span>
              <select value={style} onChange={(e) => setStyle(e.target.value)} required>
                <option value="">—</option>
                {opts('music_style').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {type === 'single' && (
                <small className="adm-optional">Instruments = beat/instrumental · Vocal or Mixed = song (with lyrics)</small>
              )}
            </label>
          </div>
        )}
        {isMusic && (
          <label className="adm-field">
            <span>Notes <span className="adm-optional">(optional)</span></span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        )}

        <button className="adm-btn adm-btn--primary" type="submit" disabled={busy || !basicComplete}>
          {editing ? 'Save changes' : 'Create product'}
        </button>
        {!basicComplete && <p className="adm-muted">All fields are required.</p>}
      </form>

      {editing && product && (
        <>
          {/* Cover */}
          <section className="adm-section">
            <h3>Cover image</h3>
            <div className="adm-cover">
              {product.coverThumbUrl ? (
                <img className="adm-cover__preview" src={product.coverThumbUrl} alt="Current cover" />
              ) : (
                <div className="adm-cover__preview adm-cover__preview--empty" aria-hidden>
                  {isMusic ? '♪' : '◻'}
                </div>
              )}
              <div className="adm-cover__actions">
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(e) => handleCover(e.target.files?.[0])}
                />
                <p className="adm-muted">
                  JPEG, PNG, WebP, GIF, or HEIC (iPhone). We convert &amp; resize automatically.
                </p>
              </div>
            </div>
          </section>

          {/* Music: audio upload + tracks + tiers */}
          {isMusic && (
            <>
              <section className="adm-section">
                <h3>Audio — upload files or a whole folder</h3>
                {isSamplePack && (
                  <p className="adm-muted">
                    Drop the whole sample folder — every file is analyzed and sorted automatically
                    (one-shot vs loop, group, BPM &amp; key). Folder structure is preserved in the download.
                  </p>
                )}
                {type === 'single' && (
                  <p className="adm-muted">A single holds exactly one track.</p>
                )}
                <div className="adm-uploads">
                  <label className="adm-drop">
                    <span>{type === 'single' ? 'Select file' : 'Select files'}</span>
                    <input
                      type="file"
                      accept="audio/*"
                      multiple={type !== 'single'}
                      onChange={(e) => handleAudio(e.target.files)}
                    />
                  </label>
                  {type !== 'single' && (
                    <label className="adm-drop">
                      <span>Select a folder</span>
                      <input ref={folderRef} type="file" multiple onChange={(e) => handleAudio(e.target.files)} />
                    </label>
                  )}
                </div>
                {busy && (
                  <p className="adm-muted">
                    Processing (ffprobe + analysis{isSamplePack ? '' : ' + preview + waveform'})… large folders take a moment.
                  </p>
                )}
                {(product.tracks?.length ?? 0) > 0 && (
                  <div className="adm-reanalyze">
                    <button className="adm-btn" onClick={handleReanalyze} disabled={busy}>
                      Re-analyze audio (BPM/key + rebuild previews)
                    </button>
                    <p className="adm-muted">
                      Re-runs detection on existing files — use after installing aubio/keyfinder or to
                      pick up the mid-song preview. No re-upload needed.
                    </p>
                  </div>
                )}
              </section>

              {isSamplePack ? (
                <SamplePackEditor product={product} onDone={loadProduct} setMsg={setMsg} setError={setError} />
              ) : (
                <section className="adm-section">
                  <h3>Tracks ({product.tracks?.length ?? 0})</h3>
                  {product.tracks && product.tracks.length > 0 ? (
                    <table className="adm-table">
                      <thead>
                        <tr><th>#</th><th>Name</th><th>Length</th><th>BPM</th><th>Key</th><th>Format</th><th>Size</th><th>Preview</th><th></th></tr>
                      </thead>
                      <tbody>
                        {product.tracks.map((t) => (
                          <tr key={t.id}>
                            <td>{t.position}</td>
                            <td>{t.name}</td>
                            <td>{fmtSecs(t.length_sec)}</td>
                            <td>{t.bpm ?? '—'}</td>
                            <td>{t.music_key ?? '—'}</td>
                            <td>{t.format ?? '—'}</td>
                            <td>{fmtBytes(t.file_size_bytes)}</td>
                            <td>{t.preview_path ? '✓' : '—'}</td>
                            <td>
                              <button
                                className="adm-trackdel"
                                title="Delete track"
                                onClick={() => handleDeleteTrack(t.id)}
                                disabled={busy}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="adm-muted">No tracks yet.</p>
                  )}
                </section>
              )}

              <TierEditor productId={product.id} tiers={product.licenseTiers ?? []} onDone={loadProduct} />
            </>
          )}

          {/* Clothing/accessory: variants */}
          {!isMusic && <VariantEditor productId={product.id} variants={product.variants ?? []} options={options} onDone={loadProduct} />}

          {/* Actions */}
          <section className="adm-section adm-actions-wrap">
            {product.status !== 'published' && !canPublish && (
              <div className="adm-checklist">
                <p>To publish, this product needs:</p>
                <ul>
                  {publishMissing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="adm-actions">
              <button
                className="adm-btn adm-btn--primary"
                onClick={doPublish}
                disabled={busy || !canPublish}
                title={canPublish ? '' : `Missing: ${publishMissing.join(', ')}`}
              >
                {product.status === 'published' ? 'Re-publish' : 'Publish'}
              </button>
              <button className="adm-btn adm-btn--danger" onClick={doDelete} disabled={busy}>Delete</button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

const GROUP_ORDER = ['drums', 'bass', 'melodic', 'vocal', 'fx', 'other']

function SamplePackEditor({
  product,
  onDone,
  setMsg,
  setError,
}: {
  product: Product
  onDone: () => Promise<void>
  setMsg: (s: string) => void
  setError: (s: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const tracks = product.tracks ?? []
  const previewCount = tracks.filter((t) => t.is_preview).length

  // Group samples for display, in a sensible group order.
  const groups = useMemo(() => {
    const map = new Map<string, typeof tracks>()
    for (const t of tracks) {
      const g = t.sample_group || 'other'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(t)
    }
    const ord = (g: string) => {
      const i = GROUP_ORDER.indexOf(g)
      return i < 0 ? 99 : i
    }
    return [...map.entries()].sort((a, b) => ord(a[0]) - ord(b[0]))
  }, [tracks])

  async function autoPick() {
    setBusy(true)
    setError('')
    try {
      const r = await adminApi.autoPreviewSet(product.id, 10)
      setMsg(`Preview set ready — ${r.previewCount} samples selected.`)
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build preview set.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(trackId: number, on: boolean) {
    setBusy(true)
    setError('')
    try {
      await adminApi.toggleTrackPreview(product.id, trackId, on)
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update preview.')
    } finally {
      setBusy(false)
    }
  }

  if (tracks.length === 0) {
    return (
      <section className="adm-section">
        <h3>Samples</h3>
        <p className="adm-muted">No samples yet — upload a folder above.</p>
      </section>
    )
  }

  return (
    <section className="adm-section">
      <div className="adm-list__head">
        <h3>Samples ({tracks.length})</h3>
        <button className="adm-btn" onClick={autoPick} disabled={busy}>
          {busy ? 'Working…' : 'Auto-pick 10 previews'}
        </button>
      </div>
      <p className={previewCount ? 'adm-ok' : 'adm-muted'}>
        {previewCount
          ? `${previewCount} sample${previewCount === 1 ? '' : 's'} in the public preview set. Star a row to add/remove.`
          : 'No preview samples yet — auto-pick, or star individual rows. At least one is required to publish.'}
      </p>
      {groups.map(([group, list]) => (
        <div key={group} className="adm-samplegroup">
          <h4 className="adm-samplegroup__title">{group} <span>({list.length})</span></h4>
          <table className="adm-table adm-table--samples">
            <thead>
              <tr><th>★</th><th>Name</th><th>Kind</th><th>Category</th><th>BPM</th><th>Key</th><th>Length</th></tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className={t.is_preview ? 'is-preview' : ''}>
                  <td>
                    <button
                      className={`adm-star ${t.is_preview ? 'is-on' : ''}`}
                      title={t.is_preview ? 'In preview set — click to remove' : 'Add to preview set'}
                      onClick={() => toggle(t.id, !t.is_preview)}
                      disabled={busy}
                    >
                      {t.is_preview ? '★' : '☆'}
                    </button>
                  </td>
                  <td>{t.name}</td>
                  <td>{kindLabel(t.kind)}</td>
                  <td>{t.sample_category ?? '—'}</td>
                  <td>{t.bpm ?? '—'}</td>
                  <td>{t.music_key ?? '—'}</td>
                  <td>{fmtSecs(t.length_sec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
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
