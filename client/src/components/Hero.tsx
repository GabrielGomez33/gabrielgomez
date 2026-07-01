import { profile } from '../data/content'

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero__side hero__side--left">
        <span>{profile.roles.join('  /  ')}</span>
      </div>
      <div className="hero__side hero__side--right">
        <span>PORTFOLIO — 2026</span>
      </div>

      <div className="container hero__inner">
        <p className="eyebrow hero__eyebrow">Developer · Creator · Musician</p>
        <h1 className="hero__title">
          <span>GABRIEL</span>
          <span>GOMEZ</span>
        </h1>
        <p className="hero__tagline">{profile.tagline}</p>
      </div>

      <a href="#about" className="hero__scroll" aria-label="Scroll to content">
        <span>SCROLL</span>
        <span className="hero__chevron" aria-hidden>&#8964;</span>
      </a>
    </section>
  )
}
