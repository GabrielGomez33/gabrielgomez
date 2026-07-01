import { socials } from '../data/content'
import { Reveal } from './Reveal'

export function Contact() {
  return (
    <section className="contact" id="contact">
      <div className="container">
        <Reveal>
          <p className="eyebrow">05 — Elsewhere</p>
        </Reveal>
        <Reveal>
          <h2 className="section-title contact__title">Let&rsquo;s Connect</h2>
        </Reveal>

        <ul className="contact__list">
          {socials.map((social, i) => (
            <Reveal as="li" key={social.label} className="contact__item" delay={i * 70}>
              <a href={social.href} target="_blank" rel="noreferrer noopener">
                <span className="contact__label">{social.label}</span>
                <span className="contact__handle">{social.handle}</span>
                <span className="contact__arrow" aria-hidden>&rarr;</span>
              </a>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
