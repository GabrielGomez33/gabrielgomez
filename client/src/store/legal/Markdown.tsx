import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

// Tiny, dependency-free Markdown renderer for our own legal documents. Handles
// the subset we author: #/##/### headings, ---, > blockquotes, -/1. lists,
// **bold**, and [text](url) links. Not a general-purpose parser.

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const rx = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = rx.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[1]}</strong>)
    } else {
      const label = m[2]
      const href = m[3]
      if (href.startsWith('/')) {
        nodes.push(
          <Link key={`${keyBase}-l${i}`} to={href.replace(/^\/GabrielGomez/, '')}>
            {label}
          </Link>,
        )
      } else {
        nodes.push(
          <a key={`${keyBase}-l${i}`} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>,
        )
      }
    }
    last = rx.lastIndex
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={key++}>{inline(line.slice(4), `h3-${key}`)}</h3>)
      i++
    } else if (line.startsWith('## ')) {
      blocks.push(<h2 key={key++}>{inline(line.slice(3), `h2-${key}`)}</h2>)
      i++
    } else if (line.startsWith('# ')) {
      blocks.push(<h1 key={key++}>{inline(line.slice(2), `h1-${key}`)}</h1>)
      i++
    } else if (line.trim() === '---') {
      blocks.push(<hr key={key++} />)
      i++
    } else if (line.startsWith('> ')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quote.push(lines[i].slice(2))
        i++
      }
      blocks.push(
        <blockquote key={key++}>{inline(quote.join(' '), `bq-${key}`)}</blockquote>,
      )
    } else if (/^\s*[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*] /, ''))
        i++
      }
      blocks.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `li-${key}-${j}`)}</li>
          ))}
        </ul>,
      )
    } else if (/^\s*\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\. /, ''))
        i++
      }
      blocks.push(
        <ol key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `oli-${key}-${j}`)}</li>
          ))}
        </ol>,
      )
    } else {
      // Paragraph: gather consecutive plain lines.
      const para: string[] = []
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,3} |> |---|\s*[-*] |\s*\d+\. )/.test(lines[i])
      ) {
        para.push(lines[i])
        i++
      }
      blocks.push(<p key={key++}>{inline(para.join(' '), `p-${key}`)}</p>)
    }
  }

  return <div className="legal__doc">{blocks}</div>
}
