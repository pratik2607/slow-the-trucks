// The answer. What the plan saves against what actually happened, in quantities only:
// Lumino's records carry no prices, so nothing here is counted in money.

import { percent } from '../../lib/format'
import { project, type Replay } from '../../model'
import { Card, Key, Pair } from './shared'

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2
}

export function Result({ run }: { run: Replay }) {
  const scores = project.items.map((i) => run.scores[i.code])
  const typical = median(scores.map((s) => s.idleCut))
  const onHandReal = median(scores.map((s) => s.monthsOnHandReal))
  const onHandPlan = median(scores.map((s) => s.monthsOnHandPlan))
  const pileCut = median(scores.map((s) => (s.peakIdleReal > 0 ? 1 - s.peakIdlePlan / s.peakIdleReal : 0)))
  const never = scores.filter((s) => s.shortMonths === 0).length
  const total = scores.length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Key />
        <span className="text-[12.5px] text-muted">For a typical item of the {total}. Counted in quantities; Lumino's records carry no prices.</span>
      </div>
      <div data-tour="tiles" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="text-[13px] text-ink-2">Stock lying idle</div>
          <div className="wide figures mt-1 text-[34px] font-extrabold leading-none tracking-[-0.02em]">
            {percent(typical)} <span className="text-[18px] font-bold tracking-normal">less</span>
          </div>
          <div className="mt-4">
            <Pair actual={1} plan={1 - typical} tall />
          </div>
          <div className="mt-3 text-[12.5px] text-muted">on average, over the whole project</div>
        </Card>

        <Card className="p-5">
          <div className="text-[13px] text-ink-2">Stock kept on hand</div>
          <div className="wide figures mt-1 text-[34px] font-extrabold leading-none tracking-[-0.02em]">
            {onHandPlan.toFixed(1)} <span className="text-[18px] font-bold tracking-normal">months</span>
          </div>
          <div className="mt-4">
            <Pair actual={onHandReal} plan={onHandPlan} tall />
          </div>
          <div className="mt-3 text-[12.5px] text-muted">of the site's own work. Actually {onHandReal.toFixed(1)} months.</div>
        </Card>

        <Card className="p-5">
          <div className="text-[13px] text-ink-2">Biggest pile</div>
          <div className="wide figures mt-1 text-[34px] font-extrabold leading-none tracking-[-0.02em]">
            {percent(pileCut)} <span className="text-[18px] font-bold tracking-normal">smaller</span>
          </div>
          <div className="mt-4">
            <Pair actual={1} plan={1 - pileCut} tall />
          </div>
          <div className="mt-3 text-[12.5px] text-muted">the most ever lying unused at once</div>
        </Card>

        <Card className="p-5">
          <div className="text-[13px] text-ink-2">Site kept waiting</div>
          <div className="wide figures mt-1 text-[34px] font-extrabold leading-none tracking-[-0.02em]">{never === total ? 'Never' : `${total - never} of ${total}`}</div>
          <div className="mt-4 flex gap-1">
            {project.items.map((i) => (
              <span
                key={i.code}
                className={`h-[1.375rem] flex-1 rounded-sm ${run.scores[i.code].shortMonths === 0 ? 'bg-saved' : 'bg-critical'}`}
                title={`${i.name}: ${run.scores[i.code].shortMonths === 0 ? 'never waited' : `waited ${run.scores[i.code].shortMonths} months`}`}
              />
            ))}
          </div>
          <div className="mt-3 text-[12.5px] text-muted">
            {never === total ? `not for any of the ${total} items, in any month` : `items wait a month or two. The other ${never} never wait.`}
          </div>
        </Card>
      </div>
    </div>
  )
}
