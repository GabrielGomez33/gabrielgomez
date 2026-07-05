import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { storeApi, formatPrice, musicTypeLabel, type ProductSummary, type ProductDetail as PD } from './storeApi'
import { WaveformPlayer } from './WaveformPlayer'
import { useCart } from './CartContext'

// =============================================================================
// The filing-cabinet music browser. Products are folders in a cabinet; a chosen
// facet (type / genre / price) becomes the black divider tabs that section them.
// Clicking a folder slides it open to reveal the cover "visualizer", a preview
// player, details, and buy actions.
// =============================================================================

type Facet = 'type' | 'genre' | 'price'
const FACETS: { key: Facet; label: string }[] = [
  { key: 'type', label: 'Type' },
  { key: 'genre', label: 'Genre' },
  { key: 'price', label: 'Price' },
]

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Ordering + plural labels for the Type drawer. Singles split into Songs/Beats.
const TYPE_META: Record<string, { label: string; order: number }> = {
  song: { label: 'Songs', order: 0 },
  beat: { label: 'Beats', order: 1 },
  beatpack: { label: 'Beatpacks', order: 2 },
  samplepack: { label: 'Sample packs', order: 3 },
  album: { label: 'Albums', order: 4 },
}

// The value + display label a product falls under for the active facet.
function facetOf(p: ProductSummary, facet: Facet): { key: string; label: string; order: number } {
  if (facet === 'type') {
    // A single is a Song or a Beat depending on its style (instruments = beat).
    const key = p.type === 'single' ? (p.style === 'instruments' ? 'beat' : 'song') : p.type
    const meta = TYPE_META[key]
    return { key, label: meta?.label ?? titleCase(key), order: meta?.order ?? 99 }
  }
  if (facet === 'genre') {
    const g = (p.genre || '').trim()
    return g ? { key: g.toLowerCase(), label: titleCase(g), order: 0 } : { key: '~', label: 'Other', order: 99 }
  }
  // price buckets
  const c = p.price_cents
  if (c <= 0) return { key: 'free', label: 'Free', order: 0 }
  if (c < 2500) return { key: 'lt25', label: 'Under $25', order: 1 }
  if (c < 5000) return { key: '25to50', label: '$25 – $50', order: 2 }
  return { key: 'gte50', label: '$50 & up', order: 3 }
}

interface Group {
  key: string
  label: string
  order: number
  items: ProductSummary[]
}

function group(products: ProductSummary[], facet: Facet): Group[] {
  const map = new Map<string, Group>()
  for (const p of products) {
    const f = facetOf(p, facet)
    let g = map.get(f.key)
    if (!g) {
      g = { key: f.key, label: f.label, order: f.order, items: [] }
      map.set(f.key, g)
    }
    g.items.push(p)
  }
  const groups = [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  for (const g of groups) g.items.sort((a, b) => a.title.localeCompare(b.title))
  return groups
}

export function MusicCabinet() {
  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [error, setError] = useState('')
  const [facet, setFacet] = useState<Facet>('type')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    storeApi
      .products('music')
      .then((d) => alive && setProducts(d.products))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load.'))
    return () => {
      alive = false
    }
  }, [])

  const groups = useMemo(() => (products ? group(products, facet) : []), [products, facet])

  // Continuous 1-based numbering across the whole cabinet (like real file tabs).
  let counter = 0

  return (
    <section className="cab">
      <header className="cab__head">
        <h1 className="catalog__title">SonSoul</h1>
        <p className="catalog__blurb">Beats, beatpacks &amp; albums. Cloudy, ethereal, alternative.</p>
        <div className="cab__facets" role="tablist" aria-label="Sort the cabinet by">
          <span className="cab__facets-label">Drawer&nbsp;by</span>
          {FACETS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={facet === f.key}
              className={`cab__facet ${facet === f.key ? 'is-active' : ''}`}
              onClick={() => {
                setFacet(f.key)
                setOpenId(null)
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div className="state state--error" role="alert">
          {error}
          <button className="st__btn" onClick={() => location.reload()}>Retry</button>
        </div>
      )}

      {!products && !error && (
        <div className="cab__stack" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="cab__folder cab__folder--skeleton" />
          ))}
        </div>
      )}

      {products && products.length === 0 && !error && (
        <p className="state state--empty">Nothing filed yet — check back soon.</p>
      )}

      {products && products.length > 0 && (
        <div className="cab__stack">
          {groups.map((g) => (
            <div key={g.key} className="cab__group">
              <div className="cab__divider">
                <span className="cab__divider-tab">
                  <span className="cab__divider-label">{g.label}</span>
                  <span className="cab__divider-count">{String(g.items.length).padStart(3, '0')}</span>
                </span>
              </div>
              {g.items.map((p, i) => {
                counter += 1
                return (
                  <Folder
                    key={p.id}
                    product={p}
                    index={counter}
                    side={i % 2 === 0 ? 'left' : 'right'}
                    open={openId === p.id}
                    onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Folder({
  product,
  index,
  side,
  open,
  onToggle,
}: {
  product: ProductSummary
  index: number
  side: 'left' | 'right'
  open: boolean
  onToggle: () => void
}) {
  const cart = useCart()
  const [detail, setDetail] = useState<PD | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [added, setAdded] = useState(false)

  // Lazy-load full detail (tracks + preview) the first time the folder opens.
  useEffect(() => {
    if (!open || detail || loadingDetail) return
    setLoadingDetail(true)
    storeApi
      .product(product.slug)
      .then((d) => setDetail(d.product))
      .catch(() => {})
      .finally(() => setLoadingDetail(false))
  }, [open, detail, loadingDetail, product.slug])

  // Prefer a track that actually has a preview (sample packs only preview ~10).
  const firstTrack =
    detail?.previewTracks?.find((t) => t.previewUrl) ||
    detail?.tracks?.find((t) => t.previewUrl) ||
    detail?.tracks?.[0]
  const cover = product.coverUrl || detail?.coverUrl || null

  function addToCart() {
    cart.add({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      unitCents: product.price_cents,
      currency: product.currency,
      isDigital: product.is_digital === 1,
      quantity: 1,
      coverUrl: product.coverUrl,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1600)
  }

  return (
    <div className={`cab__folder cab__folder--${side} ${open ? 'is-open' : ''}`}>
      <button
        className="cab__tab"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`folder-${product.id}`}
      >
        <span className="cab__num">{String(index).padStart(3, '0')}</span>
        <span className="cab__name">{product.title}</span>
        <span className="cab__meta">{musicTypeLabel(product.type, product.style)}</span>
        <span className="cab__price">{formatPrice(product.price_cents, product.currency)}</span>
      </button>

      {open && (
        <div className="cab__panel" id={`folder-${product.id}`} role="region">
          <div className="cab__visual">
            {cover ? (
              <img src={cover} alt={product.title} loading="lazy" />
            ) : (
              <div className="cab__visual-empty" aria-hidden>♪</div>
            )}
          </div>
          <div className="cab__detail">
            <p className="cab__detail-type">{product.type}</p>
            <h2 className="cab__detail-title">{product.title}</h2>
            {product.subtitle && <p className="cab__detail-sub">{product.subtitle}</p>}
            <p className="cab__chips">
              {[product.genre, product.style, product.trackCount ? `${product.trackCount} tracks` : null]
                .filter(Boolean)
                .map((c) => (
                  <span key={String(c)} className="cab__chip">{c}</span>
                ))}
            </p>

            {firstTrack ? (
              <div className="cab__player">
                <WaveformPlayer previewUrl={firstTrack.previewUrl} peaks={firstTrack.waveform_json} />
              </div>
            ) : (
              loadingDetail && <p className="state">Loading preview…</p>
            )}

            <div className="cab__actions">
              <span className="cab__detail-price">{formatPrice(product.price_cents, product.currency)}</span>
              <button className="st__btn st__btn--primary" onClick={addToCart}>
                {added ? 'Added ✓' : 'Add to cart'}
              </button>
              <Link to={`/store/product/${product.slug}`} className="cab__open">Open full page →</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
