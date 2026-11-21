// Job 2, "Plan it": the replay. What the planner says each month, and the plan next to reality.

import { useMemo } from 'react'
import { scaleLinear } from 'd3-scale'
import { Legend, TimeChart, useWidth, type Series } from '../components/chart'
import { Figure, ItemSelect, Panel, Scrubber, Segmented } from '../components/ui'
import { planItem, scorePlan, type PlanSettings } from '../engine/planner'
import { cover, godownShort, monthLabel, percent, qty, shortName, unitWord } from '../lib/format'
import { godowns, months, project, type Replay, type Selection, type SetSelection } from '../model'

const REAL = 'var(--color-real)'
const PLAN = 'var(--color-plan)'
const PLOT_LEFT = 64
const CAUTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]
const MAX_CAUTION = 4

const pct1 = (x: number) => `${(x * 100).toFixed(x > 0.9995 ? 0 : 1)}%`

function Settings({ settings, set }: { settings: PlanSettings; set: (patch: Partial<PlanSettings>) => void }) {
  return (
    <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
      <div className="text-[13px]">
        <label className="block">
          <span className="font-semibold">Buffer</span>
          <span className="ml-2 text-ink-2">{settings.caution.toFixed(2)} times the usual month-to-month swing</span>
          <input
            type="range"
            min={0}
            max={MAX_CAUTION}
            step={0.25}
            value={settings.caution}
            onChange={(e) => set({ caution: Number(e.target.value) })}
            className="mt-1.5 block w-full"
          />
          <span className="flex justify-between text-[12px] text-muted">
            <span>lean</span>
            <span>cautious</span>
          </span>
        </label>
        <div className="mb-1.5 mt-3 font-semibold">How far back it looks</div>
        <Segmented
          label="How far back the planner looks"
          value={settings.lookback}
          onChange={(lookback) => set({ lookback })}
          options={[
            { value: 6, label: '6 months' },
            { value: 9, label: '9 months' },
            { value: 12, label: '12 months' },
          ]}
        />
      </div>
      <div className="text-[13px]">
        <div className="mb-1.5 font-semibold">What counts as the site's need</div>
        <Segmented
          label="What counts as the site's need"
          value={settings.signal}
          onChange={(signal) => set({ signal })}
          options={[
            { value: 'usage', label: 'What the site used' },
            { value: 'issues', label: 'What contractors drew' },
          ]}
        />
        <p className="mt-1.5 text-[12.5px] text-ink-2">
          {settings.signal === 'usage'
            ? 'Idle stock is everything that arrived and was not used, in a godown or with a contractor. Usage is recorded for the whole project, so its split between godowns is an estimate.'
            : 'Stricter and exact per godown, but material pushed out to contractors counts as if it had been needed.'}
        </p>
      </div>
      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={settings.knowsTotal}
          onChange={(e) => set({ knowsTotal: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-ink"
        />
        <span>
          <span className="font-semibold">The planner knows the project total</span>
          <span className="mt-0.5 block text-[12.5px] text-ink-2">
            A planner always knows the contract quantity. The data pack does not include it, so the stand-in is what
            Lumino finally bought, and the plan never orders more than that.
          </span>
        </span>
      </label>
    </div>
  )
}

function TradeOff({
  points,
  caution,
  onPick,
}: {
  points: { caution: number; cut: number; onTime: number }[]
  caution: number
  onPick: (caution: number) => void
}) {
  const [ref, width] = useWidth()
  const H = 190
  const pad = { l: 44, r: 16, t: 14, b: 34 }
  const x = scaleLinear().domain([0, MAX_CAUTION]).range([pad.l, Math.max(pad.l + 1, width - pad.r)])
  const y = scaleLinear().domain([0, 1]).range([H - pad.b, pad.t])
  const path = (key: 'cut' | 'onTime') =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.caution).toFixed(1)} ${y(Math.max(0, p[key])).toFixed(1)}`).join('')
  const here = points.reduce((best, p) => (Math.abs(p.caution - caution) < Math.abs(best.caution - caution) ? p : best), points[0])

  return (
    <div ref={ref}>
      <svg width={width} height={H} role="img" aria-label="Idle stock removed and need met on time, by buffer size" className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--color-axis)' : 'var(--color-rule)'} />
            <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill="var(--color-muted)" className="figures">
              {t * 100}%
            </text>
          </g>
        ))}
        {CAUTIONS.map((c) => (
          <text key={c} x={x(c)} y={H - pad.b + 14} textAnchor="middle" fontSize={11} fill="var(--color-muted)" className="figures">
            {c}
          </text>
        ))}
        <text x={pad.l} y={H - 4} fontSize={11.5} fill="var(--color-ink-2)">
          Buffer: lean
        </text>
        <text x={width - pad.r} y={H - 4} textAnchor="end" fontSize={11.5} fill="var(--color-ink-2)">
          cautious
        </text>
        <line x1={x(here.caution)} x2={x(here.caution)} y1={pad.t} y2={H - pad.b} stroke="var(--color-ink)" />
        <path d={path('onTime')} fill="none" stroke="var(--color-ink-2)" strokeWidth={2} strokeLinejoin="round" />
        <path d={path('cut')} fill="none" stroke={PLAN} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p) => (
          <g key={p.caution} style={{ cursor: 'pointer' }} onClick={() => onPick(p.caution)}>
            <rect x={x(p.caution) - 14} y={pad.t} width={28} height={H - pad.b - pad.t} fill="transparent" />
            <circle cx={x(p.caution)} cy={y(Math.max(0, p.onTime))} r={4} fill="var(--color-ink-2)" stroke="var(--color-panel)" strokeWidth={2} />
            <circle cx={x(p.caution)} cy={y(Math.max(0, p.cut))} r={4} fill={PLAN} stroke="var(--color-panel)" strokeWidth={2} />
          </g>
        ))}
      </svg>
    </div>
  )
}

export function PlanIt({
  sel,
  set,
  run,
  setSettings,
}: {
  sel: Selection
  set: SetSelection
  run: Replay
  setSettings: (patch: Partial<PlanSettings>) => void
}) {
  const plan = run.plans[sel.item]
  const score = run.scores[sel.item]
  const unit = unitWord(plan.item.unit)
  const name = shortName(plan.item)
  const m = sel.month
  const d = plan.decisions[m]
  const L = plan.leadMonths
  const activeMonths = months.length - plan.takeover

  const stockLines: Series[] = useMemo(
    () => [
      { key: 'real', label: 'What really sat idle', color: REAL, values: plan.realIdle },
      { key: 'plan', label: 'With the planner', color: PLAN, values: plan.idle },
    ],
    [plan],
  )
  const realTrucks: Series = { key: 'realIn', label: 'Really arrived', color: REAL, values: plan.realDelivered }
  const planTrucks: Series = { key: 'planIn', label: 'Arrives in the plan', color: PLAN, values: plan.delivered }

  const shortMarks = useMemo(
    () =>
      plan.waiting
        .map((w, month) => ({ month, w }))
        .filter((k) => k.w > 1e-6)
        .map((k) => ({ month: k.month, label: `The plan runs short by ${qty(k.w)} ${unit}` })),
    [plan, unit],
  )

  const tradeOff = useMemo(
    () =>
      CAUTIONS.map((caution) => {
        const s = scorePlan(planItem(project, sel.item, { ...run.settings, caution }))
        return { caution, cut: s.idleCut, onTime: s.servedOnTime }
      }),
    [sel.item, run.settings],
  )

  const ranked = useMemo(
    () => [...project.items].sort((a, b) => run.scores[b.code].idleCut - run.scores[a.code].idleCut),
    [run],
  )
  const cuts = ranked.map((i) => run.scores[i.code].idleCut)
  const medianCut = (cuts[7] + cuts[8]) / 2
  const fullyServed = ranked.filter((i) => run.scores[i.code].shortMonths === 0).length

  const planned = d.moves.filter((mv) => !mv.rescue)
  const rescues = d.moves.filter((mv) => mv.rescue)
  const lands = m + L < months.length ? monthLabel(months[m + L]) : 'after the data ends'

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="wide text-[24px] font-bold leading-tight">Replay in detail</h2>
        <p className="mt-1 max-w-[76ch] text-[14.5px] text-ink-2">
          One item at a time: the plan next to what actually happened, the reasoning for any month, and the settings behind it.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ItemSelect value={sel.item} onChange={(item) => set({ item })} />
        <div className="flex w-full min-w-0 md:w-auto md:flex-1">
          <Scrubber month={m} set={(month) => set({ month })} />
        </div>
      </div>

      <p className="max-w-[80ch] text-[15px]">
        Replayed month by month, seeing only what was on record at the time, the planner would have kept{' '}
        <strong>
          {percent(Math.max(0, score.idleCut))} less stock of {name} sitting idle
        </strong>
        : {qty(score.avgIdlePlan)} {unit} on average instead of {qty(score.avgIdleReal)}. {pct1(score.servedOnTime)} of what the site needed was
        there in the month it was needed
        {score.shortMonths === 0
          ? ', and the project never ran short.'
          : `. It ran short in ${score.shortMonths} of ${activeMonths} months, at worst by ${qty(score.worstWaiting)} ${unit}.`}
      </p>

      <Panel
        title="Idle stock: what happened, and what the plan would have held"
        note="Everything that had arrived and not yet been used, at each month end. A red tick marks a month in which the plan runs short."
        aside={<Legend series={stockLines} />}
      >
        <TimeChart
          months={months}
          ariaLabel={`Idle stock of ${name}, reality against the plan`}
          unit={unit}
          lines={stockLines}
          marks={shortMarks}
          notes={[
            { month: plan.takeover, label: 'Planner starts deciding' },
            { month: plan.firstPlannedArrival, label: 'Its first order lands' },
          ].filter((n) => n.month < months.length)}
          cursor={m}
          onCursor={(month) => set({ month })}
          padLeft={PLOT_LEFT}
          height={250}
        />
        <div className="mt-4 border-t border-rule pt-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="text-[13px] text-ink-2">
              The trucks. Above the line: what really arrived. Below: what the plan would have called in.
            </div>
            <Legend series={[realTrucks, planTrucks]} />
          </div>
          <TimeChart
            months={months}
            ariaLabel={`Deliveries of ${name}, reality against the plan`}
            unit={unit}
            up={realTrucks}
            down={planTrucks}
            cursor={m}
            onCursor={(month) => set({ month })}
            padLeft={PLOT_LEFT}
            height={170}
          />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title={`The planner's instruction for ${monthLabel(months[m])}`}>
          {!d.active ? (
            <>
              <div className="wide text-[22px] font-bold">Watch</div>
              <p className="mt-2 max-w-[62ch] text-[14px] text-ink-2">
                The planner waits for three months of real usage before it acts. Until{' '}
                {plan.takeover < months.length ? monthLabel(months[plan.takeover]) : 'the end of the data'} the plan is simply
                what happened: {qty(plan.realDelivered[m])} {unit} arrived this month.
              </p>
            </>
          ) : (
            <>
              <div className="wide text-[22px] font-bold">
                {d.ordered > 0 ? `Order ${qty(d.ordered)} ${unit}` : 'Hold. Order nothing.'}
              </div>
              <p className="mt-2 max-w-[62ch] text-[14px]">
                The site has been needing about {qty(d.forecast)} {unit} a month. There are {qty(d.onHand)} on hand and{' '}
                {qty(d.onTheWay)} on the way: {cover(d.coverMonths)}
                {d.coverMonths === null ? '' : ' months of cover'}. An order placed now lands in {lands}, so stock has to
                carry {L + 1} months of need plus a buffer of {qty(d.buffer)}: {qty(d.target)} in all.{' '}
                {d.ordered > 0 ? 'The order closes that gap.' : 'That is already covered.'}
                {d.capped && ' The order was trimmed because the project total has been reached.'}
              </p>
              {d.orders.length > 0 && (
                <ul className="mt-3 grid gap-x-6 gap-y-1 text-[13.5px] sm:grid-cols-2">
                  {d.orders.map((o) => (
                    <li key={o.godown} className="flex justify-between border-b border-rule py-1">
                      <span>Send to {godownShort(godowns[o.godown].name)}</span>
                      <span className="figures font-semibold">
                        {qty(o.qty)} {unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {planned.length > 0 && (
                <div className="mt-3 text-[13.5px]">
                  <div className="font-semibold">Move before buying</div>
                  <ul>
                    {planned.map((mv, i) => (
                      <li key={i}>
                        {qty(mv.qty)} {unit} from {godownShort(godowns[mv.from].name)} to {godownShort(godowns[mv.to].name)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rescues.length > 0 && (
                <div className="mt-3 text-[13.5px]">
                  <div className="font-semibold">Sent during the month, when a godown ran out</div>
                  <ul>
                    {rescues.map((mv, i) => (
                      <li key={i}>
                        {qty(mv.qty)} {unit} from {godownShort(godowns[mv.from].name)} to {godownShort(godowns[mv.to].name)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 border-t border-rule pt-3 text-[14px] text-ink-2">
                What really happened in {monthLabel(months[m])}: {qty(plan.realDelivered[m])} {unit} arrived. In the plan,{' '}
                {qty(plan.delivered[m])} arrive
                {m < plan.firstPlannedArrival ? ', all ordered before the planner could act' : ''}.
              </p>
            </>
          )}
        </Panel>

        <Panel title={`${name}: the plan next to reality`}>
          <div className="grid grid-cols-2 gap-y-4">
            <Figure
              label="Idle on average"
              value={qty(score.avgIdlePlan)}
              unit={unit}
              hint={`really ${qty(score.avgIdleReal)}`}
            />
            <Figure
              label="Most ever idle"
              value={qty(score.peakIdlePlan)}
              unit={unit}
              hint={`really ${qty(score.peakIdleReal)}, in ${monthLabel(months[score.peakMonthReal])}`}
            />
            <Figure
              label="Need met on time"
              value={pct1(score.servedOnTime)}
              hint={score.shortMonths === 0 ? 'never short' : `short in ${score.shortMonths} of ${activeMonths} months`}
            />
            <Figure
              label="Bought in total"
              value={qty(score.deliveredPlan)}
              unit={unit}
              hint={`really ${qty(score.deliveredReal)}`}
            />
          </div>
        </Panel>
      </div>

      <Panel
        title="How much buffer?"
        note="Less buffer means less idle stock and more risk of the site waiting. Both are shown, so the choice is yours and not hidden in the model."
        aside={
          <Legend
            series={[
              { key: 'cut', label: 'Idle stock removed', color: PLAN },
              { key: 'onTime', label: 'Need met on time', color: 'var(--color-ink-2)' },
            ]}
          />
        }
      >
        <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <TradeOff points={tradeOff} caution={run.settings.caution} onPick={(caution) => setSettings({ caution })} />
          <Settings settings={run.settings} set={setSettings} />
        </div>
      </Panel>

      <Panel
        flush
        title="All 16 items under this plan"
        note={`Half the items lose more than ${percent(medianCut)} of their idle stock. ${fullyServed} of 16 never run short.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13.5px] whitespace-nowrap">
            <thead>
              <tr className="text-right text-[12.5px] text-ink-2">
                <th className="py-1.5 pl-4 pr-3 text-left font-medium">Item</th>
                <th className="px-3 py-1.5 font-medium">Idle on average, really</th>
                <th className="px-3 py-1.5 font-medium">With the planner</th>
                <th className="px-3 py-1.5 text-left font-medium">Idle stock removed</th>
                <th className="px-3 py-1.5 font-medium">Need met on time</th>
                <th className="px-3 py-1.5 font-medium">Months short</th>
                <th className="px-3 py-1.5 font-medium">Bought, really</th>
                <th className="py-1.5 pl-3 pr-4 font-medium">In the plan</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((item) => {
                const s = run.scores[item.code]
                const selected = item.code === sel.item
                return (
                  <tr
                    key={item.code}
                    onClick={() => set({ item: item.code })}
                    className={`cursor-pointer border-t border-rule ${selected ? 'bg-cement' : 'hover:bg-cement/50'}`}
                  >
                    <td className={`py-1.5 pl-4 pr-3 ${selected ? 'font-bold shadow-[inset_3px_0_0_var(--color-ink)]' : 'font-medium'}`}>
                      <button type="button" className="text-left" aria-pressed={selected}>
                        {shortName(item)}
                      </button>
                      <span className="ml-2 text-[12px] font-normal text-muted">{unitWord(item.unit)}</span>
                    </td>
                    <td className="figures narrow px-3 py-1.5 text-right">{qty(s.avgIdleReal)}</td>
                    <td className="figures narrow px-3 py-1.5 text-right font-semibold">{qty(s.avgIdlePlan)}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-28 shrink-0">
                          <div className="h-full rounded-r-[3px] bg-plan" style={{ width: `${Math.max(0, s.idleCut) * 100}%` }} />
                        </div>
                        <span className="figures narrow font-semibold">{s.idleCut > 0.005 ? percent(s.idleCut) : 'none'}</span>
                      </div>
                    </td>
                    <td className="figures narrow px-3 py-1.5 text-right">{pct1(s.servedOnTime)}</td>
                    <td className={`figures narrow px-3 py-1.5 text-right ${s.shortMonths ? 'font-semibold text-critical' : 'text-axis'}`}>
                      {s.shortMonths || '–'}
                    </td>
                    <td className="figures narrow px-3 py-1.5 text-right">{qty(s.deliveredReal)}</td>
                    <td className="figures narrow py-1.5 pl-3 pr-4 text-right">{qty(s.deliveredPlan)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="max-w-[86ch] px-4 pb-4 pt-3 text-[12.5px] text-ink-2">
          Items showing none were bought almost entirely before the first unit was used. A planner that learns from usage
          cannot undo an order that was placed before there was any usage to learn from.
        </p>
      </Panel>
    </div>
  )
}
