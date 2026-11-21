// Item replay: one item, followed from vendor to site month by month, actual against our plan.
// This is the only plan screen that needs an item picker, so it is the only one that has it.

import { useEffect, useMemo } from 'react'
import { Legend, TimeChart, type Series } from '../components/chart'
import { Figure, ItemSelect, Panel, PlayIcon, usePlayback } from '../components/ui'
import { monthLabel, percent, qty, shortName, unitWord } from '../lib/format'
import { months, POLE, type Replay, type Selection, type SetSelection } from '../model'
import { Flow } from './parts/Flow'
import { ACTUAL, Dot, PageHeader, PLAN } from './parts/shared'

export function ItemReplay({
  sel,
  set,
  run,
  autoplay = false,
  onAutoplayed,
}: {
  sel: Selection
  set: SetSelection
  run: Replay
  /** Start the replay from the first month as soon as the screen opens. */
  autoplay?: boolean
  onAutoplayed?: () => void
}) {
  const m = sel.month
  const play = usePlayback(m, (month) => set({ month }), true)
  useEffect(() => {
    if (!autoplay) return
    play.start()
    onAutoplayed?.()
    // Runs once when the screen is opened with autoplay set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay])
  const plan = run.plans[sel.item]
  const score = run.scores[sel.item]
  const unit = unitWord(plan.item.unit)
  const name = shortName(plan.item)

  const lines: Series[] = useMemo(
    () => [
      { key: 'real', label: 'Actual', color: ACTUAL, values: plan.realIdle },
      { key: 'plan', label: 'Our plan', color: PLAN, values: plan.idle },
    ],
    [plan],
  )
  const realTrucks: Series = { key: 'realIn', label: 'Actually arrived', color: ACTUAL, values: plan.realDelivered }
  const planTrucks: Series = { key: 'planIn', label: 'Arrives in our plan', color: PLAN, values: plan.delivered }
  const shortMarks = plan.waiting
    .map((w, month) => ({ month, w }))
    .filter((k) => k.w > 1e-6)
    .map((k) => ({ month: k.month, label: `The plan runs short by ${qty(k.w)} ${unit}` }))

  return (
    <div className="grid gap-6">
      <PageHeader title="Item replay" job="Job 2: Plan it">
        {sel.item === POLE
          ? "Lumino's brief tells of 1,700 poles lying idle because nobody slowed the trucks. Its own records show the pile reached 48,991. Follow them from vendor to site, month by month."
          : `Follow ${name} from vendor to site, month by month, actual against our plan.`}
      </PageHeader>

      <div className="sticky top-0 z-20 -mx-4 border-y border-rule bg-cement/90 px-4 py-2.5 shadow-bar backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ItemSelect value={sel.item} onChange={(item) => set({ item })} />
          <div className="flex w-full min-w-0 items-center gap-3 md:w-auto md:flex-1">
            <button type="button" onClick={play.toggle} className="flex w-[6.5rem] shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2 text-[13.5px] font-semibold text-panel">
              <PlayIcon playing={play.playing} />
              {play.playing ? 'Pause' : 'Play'}
            </button>
            <input type="range" aria-label="Month" min={0} max={months.length - 1} value={m} onChange={(e) => play.jump(Number(e.target.value))} className="min-w-0 flex-1" />
            <span className="figures w-[4.6rem] shrink-0 text-right text-[14px] font-bold">{monthLabel(months[m])}</span>
          </div>
          <span className="figures narrow flex items-center gap-2 text-[14px]">
            <Dot color={ACTUAL} />
            <span className="font-bold">{qty(plan.realIdle[m])}</span>
            <span className="text-muted">lying unused, against</span>
            <Dot color={PLAN} />
            <span className="font-bold">{qty(plan.idle[m])}</span>
          </span>
        </div>
      </div>

      <Flow sel={sel} run={run} play={play} />

      <Panel title={`${name} over the whole project`} aside={<Legend series={lines} />}>
        <div className="grid grid-cols-2 gap-y-4 lg:grid-cols-4">
          <Figure label="Idle on average" value={qty(score.avgIdlePlan)} unit={unit} hint={`actually ${qty(score.avgIdleReal)}, so ${percent(Math.max(0, score.idleCut))} less`} />
          <Figure label="Most ever idle" value={qty(score.peakIdlePlan)} unit={unit} hint={`actually ${qty(score.peakIdleReal)}, in ${monthLabel(months[score.peakMonthReal])}`} />
          <Figure label="Site kept waiting" value={score.shortMonths === 0 ? 'Never' : `${score.shortMonths} months`} hint={`${(score.servedOnTime * 100).toFixed(score.servedOnTime > 0.9995 ? 0 : 1)}% of need met on time`} />
          <Figure label="Bought in total" value={qty(score.deliveredPlan)} unit={unit} hint={`actually ${qty(score.deliveredReal)}`} />
        </div>
        <div className="mt-5 text-[13px] text-ink-2">Stock lying unused at each month end. A red tick marks a month in which the plan runs short.</div>
        <TimeChart
          months={months}
          ariaLabel={`Idle stock of ${name}, actual against our plan`}
          unit={unit}
          lines={lines}
          marks={shortMarks}
          notes={[
            { month: plan.takeover, label: 'Planner starts deciding' },
            { month: plan.firstPlannedArrival, label: 'Its first order lands' },
          ].filter((n) => n.month < months.length)}
          cursor={m}
          onCursor={play.jump}
          padLeft={60}
          height={240}
        />
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-rule pt-3">
          <div className="text-[13px] text-ink-2">Deliveries. Above the line: what actually arrived. Below: what our plan calls in.</div>
          <Legend series={[realTrucks, planTrucks]} />
        </div>
        <TimeChart months={months} ariaLabel={`Deliveries of ${name}, actual against our plan`} unit={unit} up={realTrucks} down={planTrucks} cursor={m} onCursor={play.jump} padLeft={60} height={170} />
      </Panel>
    </div>
  )
}
