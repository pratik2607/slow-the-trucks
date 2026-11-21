// Section 5: the one real choice in the plan, how big a buffer to keep. Each option shows what
// it would cost and what it would save before it is picked, so nobody has to try it to find out.

import { useMemo } from 'react'
import { Badge } from '../../components/ui'
import type { PlanSettings } from '../../engine/planner'
import { percent } from '../../lib/format'
import { project, replay, type Replay } from '../../model'
import { Section } from './shared'

const OPTIONS = [
  { caution: 1.5, name: 'Lean', means: 'A thin buffer.' },
  { caution: 2.25, name: 'Balanced', means: 'A middling buffer.' },
  { caution: 3, name: 'Careful', means: 'A generous buffer.' },
  { caution: 4, name: 'Safest', means: 'The largest buffer.' },
] as const

export function Caution({ run, setSettings }: { run: Replay; setSettings: (patch: Partial<PlanSettings>) => void }) {
  const outcomes = useMemo(
    () =>
      OPTIONS.map((o) => {
        const r = o.caution === run.settings.caution ? run : replay({ ...run.settings, caution: o.caution })
        const cuts = project.items.map((i) => r.scores[i.code].idleCut).sort((a, b) => a - b)
        const onHand = project.items.map((i) => r.scores[i.code].monthsOnHandPlan).sort((a, b) => a - b)
        return {
          ...o,
          cut: (cuts[7] + cuts[8]) / 2,
          onHand: (onHand[7] + onHand[8]) / 2,
          never: project.items.filter((i) => r.scores[i.code].shortMonths === 0).length,
          waitMonths: project.items.reduce((s, i) => s + r.scores[i.code].shortMonths, 0),
        }
      }),
    [run],
  )
  const custom = !OPTIONS.some((o) => o.caution === run.settings.caution)

  return (
    <Section
      id="caution"
      n={5}
      question="How careful should the plan be?"
      lead="A smaller buffer frees more stock but risks the site waiting. Cutting stock by starving the site does not count, so each option shows both."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {outcomes.map((o) => {
          const chosen = o.caution === run.settings.caution
          return (
            <button
              key={o.name}
              type="button"
              aria-pressed={chosen}
              onClick={() => setSettings({ caution: o.caution })}
              className={`rounded-2xl border bg-panel p-5 text-left shadow-card ${chosen ? 'border-ink ring-1 ring-ink' : 'border-rule hover:border-axis'}`}
            >
              <span className="flex min-h-7 items-center justify-between gap-2">
                <span className="wide text-[18px] font-bold">{o.name}</span>
                {chosen && <Badge tone="ink">In use</Badge>}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{o.means}</span>
              <span className="mt-4 block text-[13px] text-ink-2">Idle stock, typical item</span>
              <span className="wide figures block text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{percent(o.cut)} less</span>
              <span className="mt-1 block text-[12.5px] text-muted">{o.onHand.toFixed(1)} months of work kept on hand</span>
              <span className="mt-3 block border-t border-rule pt-3">
                {o.waitMonths === 0 ? (
                  <Badge tone="saved">site never waits</Badge>
                ) : (
                  <Badge tone={o.never >= 13 ? 'quiet' : 'wait'}>
                    site waits on {16 - o.never} of 16 items
                  </Badge>
                )}
                <span className="mt-1.5 block text-[12.5px] text-muted">
                  {o.waitMonths === 0 ? 'on any item, in any month' : `${o.waitMonths} months of waiting in all, across the project`}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {custom && <p className="mt-3 text-[13px] text-ink-2">A custom buffer is in use, set under Replay in detail.</p>}
    </Section>
  )
}
