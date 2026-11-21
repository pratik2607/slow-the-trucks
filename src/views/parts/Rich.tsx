// Shows a model's answer: plain paragraphs, "- " bullets, **bold**, and small tables whose columns
// are separated by "|". Everything is rendered as text, never as HTML.

import { Fragment, type ReactNode } from 'react'

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'table'; rows: string[][] }

const bold = (text: string): ReactNode[] =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.length > 4 && part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-bold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )

const cells = (line: string): string[] =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

export function parse(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const last = blocks[blocks.length - 1]
    if (/^[-•*]\s+/.test(line)) {
      const item = line.replace(/^[-•*]\s+/, '')
      if (last?.kind === 'ul') last.items.push(item)
      else blocks.push({ kind: 'ul', items: [item] })
    } else if (/\s\|\s/.test(line) || line.startsWith('|')) {
      if (/^[\s|:-]+$/.test(line)) continue // the dashed line some models put under a table's header
      if (last?.kind === 'table') last.rows.push(cells(line))
      else blocks.push({ kind: 'table', rows: [cells(line)] })
    } else {
      blocks.push({ kind: 'p', text: line.replace(/^#+\s*/, '') })
    }
  }
  return blocks
}

export function Rich({ text }: { text: string }) {
  return (
    <div className="grid gap-2">
      {parse(text).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>{bold(b.text)}</p>
        ) : b.kind === 'ul' ? (
          <ul key={i} className="grid gap-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.62em] size-1.5 shrink-0 rounded-full bg-muted" />
                <span>{bold(item)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div key={i} className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {b.rows[0].map((c, j) => (
                    <th key={j} className={`border-b border-rule px-2 py-1.5 font-semibold ${j ? 'text-right' : 'text-left'}`}>
                      {bold(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.slice(1).map((row, k) => (
                  <tr key={k}>
                    {row.map((c, j) => (
                      <td key={j} className={`border-b border-rule px-2 py-1.5 ${j ? 'figures text-right' : ''}`}>
                        {bold(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  )
}
