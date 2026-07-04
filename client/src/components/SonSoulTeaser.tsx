import { Link } from 'react-router-dom'
import { sonsoul } from '../data/content'
import { Reveal } from './Reveal'

export function SonSoulTeaser() {
  return (
    <section className="sonsoul" id="sonsoul">
      <div className="container sonsoul__inner">
        <Reveal>
          <p className="eyebrow">04 — Store</p>
        </Reveal>
        <Reveal delay={80}>
          <h2 className="sonsoul__word">SonSoul</h2>
        </Reveal>
        <Reveal delay={160}>
          <p className="sonsoul__tagline">{sonsoul.tagline}</p>
        </Reveal>
        <Reveal delay={240}>
          <Link to="/store/music" className="sonsoul__enter">Enter the store &rarr;</Link>
        </Reveal>
      </div>
    </section>
  )
}
