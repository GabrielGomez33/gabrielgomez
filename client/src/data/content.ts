// =============================================================================
// Single source of truth for portfolio copy. Kept as plain data so Gabriel can
// edit words without touching component markup.
// =============================================================================

export const profile = {
  name: 'Gabriel Gomez',
  roles: ['Developer', 'Creator', 'Musician'],
  tagline: 'Developer, creator, and tech enthusiast building thoughtful systems — and making cloudy, ethereal music under SonSoul.',
  // Gabriel's own words. Deliberately kept as-is; it sets the introspective,
  // self-aware tone the rest of the site leans into.
  bioQuote: 'Insert poor attempt at explaining myself',
  bioAttribution: 'GG',
  bio: [
    "I'm a developer and a musician, and I don't draw a hard line between the two — both are ways of building something honest out of a lot of small, deliberate parts.",
    'On the engineering side I work across the full stack: React front ends, Node/Express services, MySQL, real-time systems, and the infrastructure that keeps them running.',
    'As a musician I play guitar, piano, and drums. My production tends to come out cloudy, alternative, ethereal, and a little trippy — and the subject matter runs deep: self-reflection, death, life, loss, and self-accountability.',
  ],
}

export const goals: string[] = [
  'Equilibrium',
  'Success doing something I love',
  'Escaping the rat race',
  'Adventure',
  'Happiness',
]

export interface Project {
  name: string
  role: string
  blurb: string
  stack: string[]
  href?: string
}

export const projects: Project[] = [
  {
    name: 'Mirror',
    role: 'Full-stack platform',
    blurb:
      'A personal-intelligence platform for self-reflection, peer review, and collective insight. React 19 PWA with real-time group chat, in-browser ML, and a hardened Node/Express + MySQL backend running a fleet of background workers.',
    stack: ['React 19', 'TypeScript', 'Node/Express', 'MySQL', 'Redis', 'WebSockets', 'PM2'],
    href: 'https://github.com/GabrielGomez33/Mirror',
  },
  {
    name: 'DINA',
    role: 'Distributed AI service',
    blurb:
      'A message-driven AI orchestrator running local LLM inference on GPU. Custom protocol, priority queues, complexity-aware model routing, and dual exact/semantic caching — built for reliability and observable performance.',
    stack: ['TypeScript', 'Ollama', 'Redis', 'WebSockets', 'CUDA', 'PM2'],
    href: 'https://github.com/GabrielGomez33/dina-server',
  },
]

export interface SocialLink {
  label: string
  handle: string
  href: string
}

export const socials: SocialLink[] = [
  { label: 'Instagram', handle: '@gabrielegomez33', href: 'https://www.instagram.com/gabrielegomez33/' },
  { label: 'Twitter / X', handle: '@33concreterose', href: 'https://twitter.com/33concreterose' },
  { label: 'TikTok', handle: '@gabriel.elyth.gome', href: 'https://www.tiktok.com/@gabriel.elyth.gome' },
  { label: 'Facebook', handle: 'Gabriel Gomez', href: 'https://www.facebook.com/' },
  { label: 'GitHub', handle: 'GabrielGomez33', href: 'https://github.com/GabrielGomez33' },
]

// Placeholder for the SonSoul storefront (Phase 2). Surfaced now as a teaser so
// the navigation and information architecture already account for it.
export const sonsoul = {
  name: 'SonSoul',
  tagline: 'Beats & beatpacks. Cloudy, alternative, ethereal, trippy.',
  status: 'Coming soon',
}
