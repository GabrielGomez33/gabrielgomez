import { goals } from '../data/content'
import { Reveal } from './Reveal'

export function Goals() {
  return (
    <section className="goals" id="goals">
      <div className="container">
        <Reveal>
          <p className="eyebrow">02 — Goals</p>
        </Reveal>
        <ol className="goals__list">
          {goals.map((goal, i) => (
            <Reveal as="li" key={goal} className="goals__item" delay={i * 80}>
              <span className="goals__index">{String(i + 1).padStart(2, '0')}</span>
              <span className="goals__label">{goal}</span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
