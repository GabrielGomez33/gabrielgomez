import { Nav } from '../components/Nav'
import { Hero } from '../components/Hero'
import { About } from '../components/About'
import { Goals } from '../components/Goals'
import { Projects } from '../components/Projects'
import { SonSoulTeaser } from '../components/SonSoulTeaser'
import { Contact } from '../components/Contact'
import { Footer } from '../components/Footer'

export default function Portfolio() {
  return (
    <>
      <div className="atmosphere" aria-hidden />
      <div className="grain" aria-hidden />
      <div className="shell">
        <Nav />
        <main>
          <Hero />
          <About />
          <Goals />
          <Projects />
          <SonSoulTeaser />
          <Contact />
        </main>
        <Footer />
      </div>
    </>
  )
}
