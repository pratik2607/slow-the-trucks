// Section 4: every item, actual against plan. This is the evidence, so it is never hidden.

import { Badge } from '../../components/ui'
import { percent, qty, shortName, unitWord } from '../../lib/format'
import { project, type Replay, type Selection, type SetSelection } from '../../model'
import { Card, Key, Pair, Section } from './shared'

export function Scoreboard({ sel, set, run }: { sel: Selection; set: SetSelection; run: Replay }) {
  const rows = [...project.items].sort((a, b) => run.scores[b.code].idleCut - run.scores[a.code].idleCut)

  return (
    <Section
      id="items"
      n={4}
      question="Which items gain most?"
      lead="All 16 items, actual against our plan: the average stock lying idle over the whole project. Pick a row to follow that item above."
      aside={<Key />}
    >
      <Card>
        {rows.map((item) => {
          const s = run.scores[item.code]
          const selected = item.code === sel.item
          const gain = s.idleCut > 0.005
          return (
            <button
              key={item.code}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                set({ item: item.code })
                document.getElementById('flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-t border-rule px-5 py-3 text-left first:border-t-0 hover:bg-cement/60 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,12rem)_6rem] ${
                selected ? 'bg-cement/70' : ''
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{shortName(item)}</span>
                <span className="block text-[12.5px] text-muted">
                  {s.shortMonths === 0 ? 'site never waited' : `site waited ${s.shortMonths} ${s.shortMonths === 1 ? 'month' : 'months'}`}
                </span>
              </span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                <Pair actual={s.avgIdleReal} plan={s.avgIdlePlan} />
              </span>
              <span className="figures narrow hidden text-right text-[13.5px] text-ink-2 sm:block">
                {qty(s.avgIdleReal)} to <span className="font-bold text-ink">{qty(s.avgIdlePlan)}</span> {unitWord(item.unit)}
              </span>
              <span className="justify-self-end">{gain ? <Badge tone="saved">{percent(s.idleCut)} less</Badge> : <Badge>no gain</Badge>}</span>
            </button>
          )
        })}
      </Card>
      <p className="mt-3 max-w-[80ch] text-[12.5px] text-muted">
        Items showing no gain were bought almost entirely before the first unit was used. A planner that learns from usage cannot undo an order placed before
        there was any usage to learn from.
      </p>
    </Section>
  )
}
