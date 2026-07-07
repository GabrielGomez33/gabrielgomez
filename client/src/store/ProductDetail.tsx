import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { storeApi, formatPrice, formatSecs, musicTypeLabel, styleLabel, type ProductDetail as PD, type Variant } from './storeApi'
import { WaveformPlayer } from './WaveformPlayer'
import { useCart } from './CartContext'

type Tab = 'overview' | 'details'

function kindLabel(k: string | null): string | null {
  return k === 'one_shot' ? 'one-shot' : k === 'instrumental' ? 'beat' : k === 'loop' ? 'loop' : null
}

const TIER_ORDER = ['wav', 'stems', 'unlimited', 'exclusive', 'mp3']
const TIER_INFO: Record<string, { label: string; blurb: string }> = {
  wav: { label: 'WAV Lease', blurb: 'MP3 + WAV · up to 100k streams · 2 videos' },
  stems: { label: 'Trackout / Stems', blurb: '+ stems & MIDI · 250k streams · 3 videos' },
  unlimited: { label: 'Unlimited', blurb: 'No caps · all platforms' },
  exclusive: { label: 'Exclusive', blurb: 'Sole rights · removed from the store' },
  mp3: { label: 'MP3 Lease', blurb: 'MP3 only' },
}

export function ProductDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const cart = useCart()

  const [product, setProduct] = useState<PD | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [variantId, setVariantId] = useState<number | null>(null)
  const [tier, setTier] = useState<string | null>(null)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  async function load(): Promise<PD | null> {
    if (!slug) return null
    const { product: p } = await storeApi.product(slug)
    setProduct(p)
    return p
  }

  useEffect(() => {
    let alive = true
    setProduct(null)
    setError('')
    if (!slug) return
    storeApi
      .product(slug)
      .then((d) => {
        if (!alive) return
        setProduct(d.product)
        if (d.product.variants[0]) setVariantId(d.product.variants[0].id)
        const cheapest = [...(d.product.licenseTiers ?? [])].sort((a, b) => a.price_cents - b.price_cents)[0]
        if (cheapest) setTier(cheapest.tier)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load.'))
    return () => {
      alive = false
    }
  }, [slug])

  const isMusic = product?.category === 'music'
  const isSamplePack = product?.type === 'samplepack'
  const previewTracks = useMemo(
    () => product?.previewTracks ?? product?.tracks.filter((t) => t.is_preview && t.previewUrl) ?? [],
    [product],
  )
  const sampleGroups = useMemo(() => {
    const order = ['drums', 'bass', 'melodic', 'vocal', 'fx', 'other']
    const map = new Map<string, PD['tracks']>()
    for (const t of product?.tracks ?? []) {
      const g = t.sample_group || 'other'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(t)
    }
    return [...map.entries()].sort((a, b) => {
      const oa = order.indexOf(a[0]); const ob = order.indexOf(b[0])
      return (oa < 0 ? 99 : oa) - (ob < 0 ? 99 : ob)
    })
  }, [product])
  const selectedVariant: Variant | undefined = useMemo(
    () => product?.variants.find((v) => v.id === variantId),
    [product, variantId],
  )
  const sortedTiers = useMemo(() => {
    return [...(product?.licenseTiers ?? [])].sort((a, b) => {
      const oa = TIER_ORDER.indexOf(a.tier)
      const ob = TIER_ORDER.indexOf(b.tier)
      return (oa < 0 ? 9 : oa) - (ob < 0 ? 9 : ob)
    })
  }, [product])
  const selectedTier = sortedTiers.find((t) => t.tier === tier)
  // Music with a license ladder is priced by tier; everything else by base + variant.
  const unitCents =
    isMusic && selectedTier
      ? selectedTier.price_cents
      : (product?.price_cents ?? 0) + (selectedVariant?.price_delta_cents ?? 0)
  const outOfStock = Boolean(selectedVariant && selectedVariant.stock_qty <= 0)
  const needsVariant = Boolean(product && !isMusic && product.variants.length > 0 && !variantId)

  function addToCart() {
    if (!product) return
    cart.add({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      unitCents,
      currency: product.currency,
      isDigital: product.is_digital === 1,
      quantity: qty,
      variantId: selectedVariant?.id ?? null,
      licenseTier: isMusic && selectedTier ? selectedTier.tier : null,
      variantLabel: selectedVariant
        ? [selectedVariant.size, selectedVariant.color, selectedVariant.style].filter(Boolean).join(' / ')
        : null,
      coverUrl: product.coverUrl,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1600)
  }

  if (error) {
    return (
      <div className="state state--error" role="alert">
        {error}
        <button className="st__btn" onClick={() => navigate(-1)}>Go back</button>
      </div>
    )
  }
  if (!product) return <div className="state">Loading…</div>

  return (
    <article className="pdetail">
      <div className="pdetail__media">
        {product.coverUrl ? (
          <img src={product.coverUrl} alt={product.title} />
        ) : (
          <div className="pdetail__placeholder" aria-hidden>{isMusic ? '♪' : '◻'}</div>
        )}
      </div>

      <div className="pdetail__info">
        <p className="pdetail__type">
          {isMusic ? musicTypeLabel(product.type, product.musicMeta?.style as string | undefined) : product.type}
        </p>
        <h1 className="pdetail__title">{product.title}</h1>
        {product.subtitle && <p className="pdetail__sub">{product.subtitle}</p>}

        {/* Base price only when there is no license ladder (the ladder is the price). */}
        {!(isMusic && sortedTiers.length > 0) && (
          <p className="pdetail__price">{formatPrice(unitCents, product.currency)}</p>
        )}

        {isMusic && sortedTiers.length > 0 && (
          <div className="pdetail__tiers">
            <span className="pdetail__tiers-label">Choose a license</span>
            {sortedTiers.map((t) => {
              // Stems tier is unavailable unless stems have been uploaded for this beat.
              const stemsBlocked = t.tier === 'stems' && product.stems_available !== 1
              return (
                <button
                  key={t.tier}
                  type="button"
                  className={`pdetail__tier ${tier === t.tier ? 'is-active' : ''} ${stemsBlocked ? 'is-unavailable' : ''}`}
                  onClick={() => !stemsBlocked && setTier(t.tier)}
                  disabled={stemsBlocked}
                  aria-pressed={tier === t.tier}
                >
                  <span className="pdetail__tier-top">
                    <span className="pdetail__tier-name">{TIER_INFO[t.tier]?.label ?? t.tier}</span>
                    <span className="pdetail__tier-price">
                      {stemsBlocked ? 'Unavailable' : formatPrice(t.price_cents, product.currency)}
                    </span>
                  </span>
                  <span className="pdetail__tier-blurb">
                    {stemsBlocked ? 'No trackout/stems available for this beat' : TIER_INFO[t.tier]?.blurb}
                  </span>
                </button>
              )
            })}
            <Link to="/store/terms#licenses" className="pdetail__tier-link">Full license terms →</Link>
          </div>
        )}

        {/* Clothing/accessory: variant + quantity */}
        {!isMusic && product.variants.length > 0 && (
          <div className="pdetail__variants">
            <label className="pdetail__field">
              <span>Option</span>
              <select value={variantId ?? ''} onChange={(e) => setVariantId(Number(e.target.value) || null)}>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={v.stock_qty <= 0}>
                    {[v.size, v.color, v.style].filter(Boolean).join(' / ') || `Option ${v.id}`}
                    {v.stock_qty <= 0 ? ' — sold out' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="pdetail__qty">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Increase quantity">+</button>
            </div>
          </div>
        )}

        <button className="st__btn st__btn--primary pdetail__add" onClick={addToCart} disabled={outOfStock || needsVariant}>
          {added ? 'Added ✓' : outOfStock ? 'Sold out' : 'Add to cart'}
        </button>

        {/* Tabs */}
        <div className="pdetail__tabs">
          <button className={tab === 'overview' ? 'is-active' : ''} onClick={() => setTab('overview')}>
            {isMusic ? 'Tracks' : 'Description'}
          </button>
          <button className={tab === 'details' ? 'is-active' : ''} onClick={() => setTab('details')}>Details</button>
        </div>

        {tab === 'overview' && (
          <div className="pdetail__panel">
            {isSamplePack ? (
              <div className="samplepack">
                {product.sampleSummary && (
                  <p className="samplepack__summary">
                    {product.sampleSummary.total} samples
                    {product.sampleSummary.oneShots ? ` · ${product.sampleSummary.oneShots} one-shots` : ''}
                    {product.sampleSummary.loops ? ` · ${product.sampleSummary.loops} loops` : ''}
                    {product.sampleSummary.bpmMin
                      ? ` · ${product.sampleSummary.bpmMin}${
                          product.sampleSummary.bpmMax !== product.sampleSummary.bpmMin
                            ? `–${product.sampleSummary.bpmMax}`
                            : ''
                        } BPM`
                      : ''}
                  </p>
                )}

                {previewTracks.length > 0 && (
                  <div className="samplepack__previews">
                    <h3 className="samplepack__h">Preview — {previewTracks.length} random samples</h3>
                    <ul className="tracklist">
                      {previewTracks.map((t) => (
                        <li key={t.id} className="track">
                          <div className="track__head">
                            <span className="track__name">{t.name}</span>
                            <span className="track__len">
                              {[kindLabel(t.kind),
                                t.bpm ? `${t.bpm} BPM` : null,
                                t.music_key,
                              ].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                          <WaveformPlayer
                            previewUrl={t.previewUrl}
                            peaks={t.waveform_json}
                            onNeedFreshUrl={async () => {
                              const fresh = await load()
                              const list = fresh?.previewTracks ?? fresh?.tracks ?? []
                              return list.find((x) => x.id === t.id)?.previewUrl ?? null
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="samplepack__manifest">
                  <h3 className="samplepack__h">What's inside</h3>
                  {sampleGroups.map(([group, list]) => (
                    <details key={group} className="samplepack__group" open>
                      <summary>{group} <span>({list.length})</span></summary>
                      <ul>
                        {list.map((t) => (
                          <li key={t.id}>
                            <span className="samplepack__name">{t.name}</span>
                            <span className="samplepack__tags">
                              {[kindLabel(t.kind),
                                t.bpm ? `${t.bpm} BPM` : null,
                                t.music_key,
                              ].filter(Boolean).join(' · ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </div>
            ) : isMusic ? (
              product.tracks.length ? (
                <ul className="tracklist">
                  {product.tracks.map((t) => (
                    <li key={t.id} className="track">
                      <div className="track__head">
                        <span className="track__pos">{String(t.position).padStart(2, '0')}</span>
                        <span className="track__name">{t.name}</span>
                        <span className="track__len">{formatSecs(t.length_sec)}</span>
                      </div>
                      <WaveformPlayer
                        previewUrl={t.previewUrl}
                        peaks={t.waveform_json}
                        onNeedFreshUrl={async () => {
                          const fresh = await load()
                          return fresh?.tracks.find((x) => x.id === t.id)?.previewUrl ?? null
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="state--empty">Tracklist coming soon.</p>
              )
            ) : (
              <p className="pdetail__desc">{product.description || 'No description yet.'}</p>
            )}
          </div>
        )}

        {tab === 'details' && (
          <div className="pdetail__panel">
            {isMusic && product.description && <p className="pdetail__desc">{product.description}</p>}
            <dl className="pdetail__meta">
              {isMusic && product.musicMeta && (
                <>
                  {(product.musicMeta.genre as string) && (
                    <div><dt>Genre</dt><dd>{String(product.musicMeta.genre)}</dd></div>
                  )}
                  {(product.musicMeta.style as string) && (
                    <div><dt>Style</dt><dd>{styleLabel(product.musicMeta.style as string)}</dd></div>
                  )}
                  {Boolean(product.musicMeta.track_count) && (
                    <div><dt>Tracks</dt><dd>{String(product.musicMeta.track_count)}</dd></div>
                  )}
                  {Boolean(product.musicMeta.total_length_sec) && (
                    <div><dt>Length</dt><dd>{formatSecs(Number(product.musicMeta.total_length_sec))}</dd></div>
                  )}
                </>
              )}
              <div><dt>Type</dt><dd>{product.type}</dd></div>
              <div><dt>Delivery</dt><dd>{product.is_digital ? 'Digital download' : 'Ships to you'}</dd></div>
            </dl>
          </div>
        )}
      </div>
    </article>
  )
}
