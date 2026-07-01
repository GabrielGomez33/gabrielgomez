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
              <div className="project__inner">
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
                <div className="project__links">
                  {project.github && (
                    <a
                      className="project__link-btn"
                      href={project.github}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Code <span aria-hidden>&#8599;</span>
                    </a>
                  )}
                  {project.live && (
                    <a
                      className="project__link-btn project__link-btn--live"
                      href={project.live}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Live <span aria-hidden>&#8599;</span>
                    </a>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
