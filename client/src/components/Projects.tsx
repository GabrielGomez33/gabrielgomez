import { projects } from '../data/content'
import { Reveal } from './Reveal'

export function Projects() {
  return (
    <section className="work" id="work">
      <div className="container">
        <Reveal>
          <p className="eyebrow">03 — Selected Work</p>
        </Reveal>
        <Reveal>
          <h2 className="section-title work__title">Things I&rsquo;ve Built</h2>
        </Reveal>

        <div className="work__list">
          {projects.map((project, i) => (
            <Reveal as="article" key={project.name} className="project" delay={i * 100}>
              <a
                className="project__link"
                href={project.href}
                target="_blank"
                rel="noreferrer noopener"
              >
                <div className="project__head">
                  <h3 className="project__name">{project.name}</h3>
                  <span className="project__role">{project.role}</span>
                </div>
                <p className="project__blurb">{project.blurb}</p>
                <ul className="project__stack">
                  {project.stack.map((tech) => (
                    <li key={tech}>{tech}</li>
                  ))}
                </ul>
                <span className="project__cta">View source &rarr;</span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
