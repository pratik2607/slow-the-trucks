// Pieces shared by the sections of the main page.
//
// Two colours carry all the meaning on this page: one for what actually happened, one for our
// plan. Every figure is shown as that pair, so nothing has to be learned twice.

import type { ReactNode } from 'react'
import type { ItemPlan } from '../../engine/planner'
import { cover, godownShort, qty, shortName } from '../../lib/format'
import { godowns, project } from '../../model'

export const ACTUAL = 'var(--color-real)'
export const PLAN = 'var(--color-plan)'

export const place = (g: number) => godownShort(godowns[g].name)
export const itemName = (code: string) => shortName(project.items.find((i) => i.code === code)!)

export function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
}

/** The page's only legend. */
export function Key() {
  return (
    <span className="inline-flex items-center gap-4 text-[13px] text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <Dot color={ACTUAL} /> Actual
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot color={PLAN} /> Our plan
      </span>
    </span>
  )
}

/** Actual above, plan below, on one scale. The gap between them is what was saved. */
export function Pair({ actual, plan, tall = false }: { actual: number; plan: number; tall?: boolean }) {
  const scale = Math.max(actual, plan, 1e-9)
  const h = tall ? 'h-2.5' : 'h-2'
  return (
    <span className="block">
      <span className={`block ${h} rounded-full bg-real-soft`}>
        <span className={`block ${h} rounded-full bg-real`} style={{ width: `${(actual / scale) * 100}%` }} />
      </span>
      <span className={`mt-1 block ${h} rounded-full bg-plan-soft`}>
        <span className={`block ${h} rounded-full bg-plan`} style={{ width: `${(plan / scale) * 100}%` }} />
      </span>
    </span>
  )
}

/** A section is one question, answered. */
export function Section({ id, n, question, lead, aside, children }: { id: string; n: number; question: string; lead?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-[68ch]">
          <h2 className="flex items-center gap-3">
            <span className="figures flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-panel">{n}</span>
            <span className="wide text-[23px] font-bold leading-tight tracking-[-0.01em]">{question}</span>
          </h2>
          {lead && <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{lead}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-rule bg-panel shadow-card ${className}`}>{children}</div>
}

/** Why the planner says what it says, in the words a storekeeper would use. */
export function reason(p: ItemPlan, m: number, unit: string): string {
  const d = p.decisions[m]
  if (!d.active) return 'It waits for three months of real usage before it decides anything. Until then it changes nothing.'
  if (!(d.forecast > 0)) return 'The site has not been using this lately, so nothing is ordered.'
  const mustLast = d.target / d.forecast
  return (
    `The site has been using about ${qty(d.forecast)} ${unit} a month. On hand and on the way there are ${qty(d.onHand + d.onTheWay)}, ` +
    `enough for ${cover(d.coverMonths)} months. A new order takes ${p.leadMonths} ${p.leadMonths === 1 ? 'month' : 'months'} to land, ` +
    `so stock has to last ${mustLast.toFixed(1)} months. ` +
    (d.ordered > 0 ? 'It orders the gap.' : 'That is covered, so it orders nothing.') +
    (d.capped ? ' The order is trimmed because the project total has been reached.' : '')
  )
}

// Four stations, drawn in one line weight so they read as one family.
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function StationIcon({ kind }: { kind: 'vendor' | 'godown' | 'contractor' | 'site' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden {...stroke}>
      {kind === 'vendor' && (
        <>
          <path d="M2.5 7h10.5v9.5H2.5zM13 10h4.2l3.3 3.3v3.2H13" />
          <circle cx="6.8" cy="17.3" r="1.8" />
          <circle cx="16.8" cy="17.3" r="1.8" />
        </>
      )}
      {kind === 'godown' && <path d="M3 10.2 12 5l9 5.2V19H3zM8 19v-6h8v6M8 16h8" />}
      {kind === 'contractor' && <path d="M4 16.5a8 8 0 0 1 16 0M2.5 16.5h19M10 8.6V6h4v2.6M7 19.5h10" />}
      {kind === 'site' && <path d="M12 3v18M6 7h12M8 11h8M6 7l-2 3M18 7l2 3M9 21h6" />}
    </svg>
  )
}
