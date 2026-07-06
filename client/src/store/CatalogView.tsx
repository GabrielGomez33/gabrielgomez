import { useEffect, useState } from 'react'
import { storeApi, type Category, type ProductSummary } from './storeApi'
import { ProductCard } from './ProductCard'
import { MusicCabinet } from './MusicCabinet'

const HEADINGS: Record<Category, { title: string; blurb: string }> = {
  music: { title: 'SonSoul', blurb: 'Beats & sample packs, singles & albums. Cloudy, ethereal, alternative.' },
  clothing: { title: 'Wear', blurb: 'Considered pieces in black & white.' },
  accessory: { title: 'Accessories', blurb: 'The finishing details.' },
}

export function CatalogView({ category }: { category: Category }) {
  // Music gets the filing-cabinet browser; other categories use the grid.
  if (category === 'music') return <MusicCabinet />
  return <CatalogGrid category={category} />
}

function CatalogGrid({ category }: { category: Category }) {
  const [products, setProducts] = useState<ProductSummary[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setProducts(null)
    setError('')
    storeApi
      .products(category)
      .then((d) => alive && setProducts(d.products))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load.'))
    return () => {
      alive = false
    }
  }, [category])

  const h = HEADINGS[category]

  return (
    <section className="catalog">
      <header className="catalog__head">
        <h1 className="catalog__title">{h.title}</h1>
        <p className="catalog__blurb">{h.blurb}</p>
      </header>

      {error && (
        <div className="state state--error" role="alert">
          {error}
          <button className="st__btn" onClick={() => location.reload()}>Retry</button>
        </div>
      )}

      {!products && !error && (
        <div className="pgrid" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pcard pcard--skeleton" />
          ))}
        </div>
      )}

      {products && products.length === 0 && !error && (
        <p className="state state--empty">Nothing here yet — check back soon.</p>
      )}

      {products && products.length > 0 && (
        <div className="pgrid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  )
}
