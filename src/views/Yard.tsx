// The yard: the pile as a storekeeper would see it, filling up month by month, next to the same
// yard if the planner had been deciding. This is the one loud thing on the site.

import { useWidth } from '../components/chart'
import { Figure, ItemSelect, Scrubber } from '../components/ui'
import type { MoneyView, RateCard } from '../engine/money'
import { cover, monthLabel, percent, qty, rupees, shortName, unitWord } from '../lib/format'
import { ledgers, months, project, type Replay, type Selection, type SetSelection } from '../model'
import { usingAssumedRates } from './MoneyPanel'

const REAL = 'var(--color-real)'
const PLAN = 'var(--color-plan)'

/** A round number of units per mark, so the real pile at its worst is a few hundred marks. */
function unitsPerMark(peak: number): number {
  const raw = peak / 600
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))
  const step = [1, 2, 5, 10].find((s) => s * magnitude >= raw) ?? 10
  return step * magnitude
}

function Pile({ filled, slots, color, label }: { filled: number; slots: number; color: string; label: string }) {
  const [ref, width] = useWidth()
  const w = width < 420 ? 11 : 17
  const h = 5
  const gap = 3
  const cols = Math.max(1, Math.floor((width + gap) / (w + gap)))
  const rows = Math.ceil(slots / cols)
  const height = rows * (h + gap)
  const whole = Math.floor(filled)

  return (
    <div ref={ref}>
      <svg width={width} height={height} role="img" aria-label={label} className="block">
        {Array.from({ length: slots }, (_, i) => {
          // Stack from the ground up, the way a yard fills.
          const row = Math.floor(i / cols)
          const on = i < whole
          const part = i === whole ? filled - whole : 0
          return (
            <rect
              key={i}
              x={(i % cols) * (w + gap)}
              y={height - (row + 1) * (h + gap) + gap}
              width={w}
              height={h}
              rx={h / 2}
              fill={on || part > 0.05 ? color : 'var(--color-rule)'}
              fillOpacity={on ? 1 : part > 0.05 ? 0.3 + 0.7 * part : 0.75}
            />
          )
        })}
      </svg>
    </div>
  )
}

export function Yard({
  sel,
  set,
  run,
  money,
  rates,
  open,
}: {
  sel: Selection
  set: SetSelection
  run: Replay
  money: MoneyView
  rates: RateCard
  open: (tab: 'see' | 'plan' | 'sets') => void
}) {
  const plan = run.plans[sel.item]
  const score = run.scores[sel.item]
  const l = ledgers[sel.item]
  const unit = unitWord(plan.item.unit)
  const m = sel.month
  const d = plan.decisions[m]
  const rate = rates.perUnit[sel.item] ?? 0
  const assumed = usingAssumedRates(rates)

  const peak = Math.max(...plan.realIdle)
  const per = unitsPerMark(peak)
  const slots = Math.max(1, Math.ceil(peak / per))
  const deliveries = project.flows[sel.item].g.reduce((s, g) => s + g.recN[m], 0)
  const arrived = plan.realDelivered[m]
  const used = l.used[m]
  const idleReal = plan.realIdle[m]
  const idlePlan = plan.idle[m]
  const lasts = l.coverMonths[m]
  const never = project.items.filter((i) => run.scores[i.code].shortMonths === 0).length
  const cuts = project.items.map((i) => run.scores[i.code].idleCut).sort((a, b) => a - b)
  const medianCut = (cuts[7] + cuts[8]) / 2

  const realNote =
    arrived > 0
      ? `${qty(arrived)} more arrived this month, on ${qty(deliveries)} ${deliveries === 1 ? 'delivery' : 'deliveries'}. The site used ${qty(used)}.` +
        (lasts !== null && lasts > plan.leadMonths + 2 ? ` What was already lying here would last ${cover(lasts)} months.` : '')
      : idleReal > 0
        ? `No deliveries this month. The site used ${qty(used)} from the pile.`
        : 'Nothing has arrived yet.'

  const planNote = !d.active
    ? 'The planner is still watching. It needs three months of real usage before it acts, and it cannot stop trucks already on the road.'
    : (d.ordered > 0
        ? `The planner orders ${qty(d.ordered)}, to land ${plan.leadMonths} months from now.`
        : 'The planner says hold. Order nothing.') +
      (plan.delivered[m] > 0 ? ` ${qty(plan.delivered[m])} arrive this month.` : ' Nothing arrives this month.') +
      (plan.waiting[m] > 1e-6 ? ` The site is waiting for ${qty(plan.waiting[m])}.` : '')

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="wide max-w-[22ch] text-[34px] font-extrabold leading-[1.05] tracking-[-0.015em] sm:text-[46px]">
          The story says 1,700 poles. The yard says 48,991.
        </h2>
        <p className="mt-3 max-w-[70ch] text-[16px] text-ink-2">
          Lumino's brief tells of 1,700 poles lying idle because nobody slowed the trucks. Its own records for this
          project show the pile reached 48,991 in February 2025, about twenty months of work. Press play to watch it
          build, next to the same yard with a planner that orders from what the site actually uses.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Scrubber month={m} set={(month) => set({ month })} restart />
        <ItemSelect value={sel.item} onChange={(item) => set({ item })} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-md border border-rule bg-panel p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold">What happened</h3>
            <span className="figures text-[13px] text-ink-2">{monthLabel(months[m])}</span>
          </div>
          <div className="wide figures mt-1 text-[40px] font-extrabold leading-none">{qty(idleReal)}</div>
          <div className="mt-1 text-[13.5px] text-ink-2">
            {unit} of {shortName(plan.item)} arrived and not used, worth {rupees(idleReal * rate)}
          </div>
          <div className="mt-3">
            <Pile filled={idleReal / per} slots={slots} color={REAL} label={`${qty(idleReal)} ${unit} lying idle in reality`} />
          </div>
          <p className="mt-3 min-h-[3.2em] text-[14px]">{realNote}</p>
        </section>

        <section className="rounded-md border border-rule bg-panel p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold">With the planner</h3>
            <span className="figures text-[13px] text-ink-2">{monthLabel(months[m])}</span>
          </div>
          <div className="wide figures mt-1 text-[40px] font-extrabold leading-none">{qty(idlePlan)}</div>
          <div className="mt-1 text-[13.5px] text-ink-2">
            {unit} arrived and not used, worth {rupees(idlePlan * rate)}
          </div>
          <div className="mt-3">
            <Pile filled={idlePlan / per} slots={slots} color={PLAN} label={`${qty(idlePlan)} ${unit} lying idle in the plan`} />
          </div>
          <p className="mt-3 min-h-[3.2em] text-[14px]">{planNote}</p>
        </section>
      </div>

      <p className="text-[12.5px] text-muted">
        Each mark is {qty(per)} {unit}. Both yards are drawn to the size of the real pile at its worst. Rupee figures use{' '}
        {assumed ? `an assumed ₹${qty(rate)} per unit, not Lumino's rate` : `your rate of ₹${qty(rate)} per unit`}.
      </p>

      <section className="rounded-md border border-rule bg-panel p-4">
        <h3 className="text-[15px] font-semibold">Over the whole project</h3>
        <div className="mt-3 grid grid-cols-2 gap-y-4 lg:grid-cols-4">
          <Figure
            label={`${shortName(plan.item)}: idle on average`}
            value={qty(score.avgIdlePlan)}
            unit={unit}
            hint={`really ${qty(score.avgIdleReal)}, so ${percent(Math.max(0, score.idleCut))} less`}
          />
          <Figure
            label="Was the site ever kept waiting?"
            value={score.shortMonths === 0 ? 'Never' : `${score.shortMonths} months`}
            hint={`${(score.servedOnTime * 100).toFixed(score.servedOnTime > 0.9995 ? 0 : 1)}% of need met in the month it arose`}
          />
          <Figure
            label="All 16 items: money sitting idle"
            value={rupees(money.avgPlan)}
            hint={`really ${rupees(money.avgReal)} on average${assumed ? ', at assumed rates' : ''}`}
          />
          <Figure
            label="All 16 items: holding cost avoided"
            value={rupees(Math.max(0, money.carryReal - money.carryPlan))}
            hint={`half the items lose over ${percent(medianCut)} of idle stock; ${never} of 16 never run short`}
          />
        </div>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold">Lumino asked for three jobs</h3>
        <ol className="mt-2 grid gap-3 md:grid-cols-3">
          {(
            [
              ['see', 'See it', 'Every item and every godown, month by month: what came in, what went out, what was used and what sat idle.'],
              ['plan', 'Plan it', 'The replay. Each month the planner sees only the past and says order, hold or move. Then the plan is set next to what happened.'],
              ['sets', 'Match the sets', 'A clamp is no use without its hook and bolts. Every month and godown where a set is out of balance.'],
            ] as const
          ).map(([id, title, text], i) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => open(id)}
                className="h-full w-full rounded-md border border-rule bg-panel p-4 text-left hover:border-ink"
              >
                <span className="wide block text-[17px] font-bold">
                  {i + 1}. {title}
                </span>
                <span className="mt-1 block text-[13.5px] text-ink-2">{text}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
