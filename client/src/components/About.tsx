import { profile } from '../data/content'
import { Reveal } from './Reveal'

export function About() {
  return (
    <section className="about" id="about">
      <div className="container about__grid">
        <div className="about__aside">
          <Reveal>
            <p className="eyebrow">01 — About</p>
          </Reveal>
          <Reveal delay={120}>
            <blockquote className="about__quote">
              <span className="about__quote-mark" aria-hidden>&ldquo;</span>
              {profile.bioQuote}
              <footer>&mdash; {profile.bioAttribution}</footer>
            </blockquote>
          </Reveal>
        </div>

        <div className="about__body">
          {profile.bio.map((para, i) => (
            <Reveal key={i} as="p" className="about__para" delay={i * 90}>
              {para}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
