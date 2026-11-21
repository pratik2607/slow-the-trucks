// The main page. It follows the shape of the solution itself:
//   1. what happened   2. what the planner says   3. what that would have changed
// first for one item you can watch, then as the month's sheet for all 16, then as the result
// over the whole project. Every number behind it lives in "the working".

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Legend, TimeChart, type Series } from '../components/chart'
import { Pile, unitsPerMark } from '../components/pile'
import { Figure, ItemSelect, Scrubber } from '../components/ui'
import type { MoneyView, RateCard } from '../engine/money'
import type { ItemPlan } from '../engine/planner'
import { remedyOf } from '../engine/sets'
import { cover, godownShort, monthLabel, percent, qty, rupees, shortName, unitWord } from '../lib/format'
import { godowns, ledgers, months, project, setsCheck, type Replay, type Selection, type SetSelection } from '../model'
import { usingAssumedRates } from './MoneyPanel'

const REAL = 'var(--color-real)'
const PLAN = 'var(--color-plan)'
const crore = (v: number) => `₹${(v / 1e7).toFixed(v >= 1e8 || v === 0 ? 0 : 1)} cr`

const SET_PLURAL: Record<string, string> = {
  MRP070060: 'Pole clamp sets',
  MRP070064: 'Single phase boxes',
  MRP070065: 'Three phase boxes',
}

const place = (g: number) => godownShort(godowns[g].name)
const itemName = (code: string) => shortName(project.items.find((i) => i.code === code)!)

/** Why the planner says what it says, in the words a storekeeper would use. */
function reason(p: ItemPlan, m: number, unit: string): string {
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

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-md border border-rule bg-panel p-4">
      <h3 className="flex items-baseline gap-2 text-[15px] font-semibold">
        <span className="wide figures flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-panel">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** One line of the month's sheet. Opens to show the reasoning. */
function Line({ title, action, hint, children }: { title: string; action: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group border-t border-rule first:border-t-0">
      <summary className="flex cursor-pointer list-none items-baseline gap-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="font-medium">{title}</span>
          {hint && <span className="ml-2 text-[12.5px] text-muted">{hint}</span>}
        </span>
        <span className="figures narrow shrink-0 text-right font-semibold">{action}</span>
        <span aria-hidden className="w-3 shrink-0 text-center text-muted">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>
      <div className="pb-3 pr-6 text-[13.5px] text-ink-2">{children}</div>
    </details>
  )
}

function Group({ verb, count, noun, meaning, children }: { verb: string; count: number; noun: string; meaning: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-rule bg-panel p-4">
      <h4 className="flex items-baseline gap-2">
        <span className="wide text-[19px] font-bold">{verb}</span>
        <span className="figures text-[13.5px] text-ink-2">
          {count} {noun}
        </span>
      </h4>
      <p className="mb-2 text-[13px] text-ink-2">{meaning}</p>
      {count === 0 ? <p className="border-t border-rule pt-2 text-[13.5px] text-muted">Nothing this month.</p> : children}
    </section>
  )
}

export function ThePlan({
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
  const m = sel.month
  const month = monthLabel(months[m])
  const plan = run.plans[sel.item]
  const l = ledgers[sel.item]
  const unit = unitWord(plan.item.unit)
  const d = plan.decisions[m]
  const rate = rates.perUnit[sel.item] ?? 0
  const assumed = usingAssumedRates(rates)

  const peak = Math.max(...plan.realIdle)
  const per = unitsPerMark(peak)
  const slots = Math.max(1, Math.ceil(peak / per))
  const deliveries = project.flows[sel.item].g.reduce((s, g) => s + g.recN[m], 0)
  const arrived = plan.realDelivered[m]
  const planArrived = plan.delivered[m]
  const lasts = l.coverMonths[m]
  const onTheRoad = m < plan.firstPlannedArrival
  const truckScale = Math.max(arrived, planArrived, 1)

  // ---- the month's sheet, all items ---------------------------------------------------------------
  const sheet = useMemo(() => {
    const order: ItemPlan[] = []
    const hold: ItemPlan[] = []
    const watching: ItemPlan[] = []
    const moves: { p: ItemPlan; from: number; to: number; qty: number; rescue: boolean }[] = []
    for (const item of project.items) {
      const p = run.plans[item.code]
      const dec = p.decisions[m]
      if (!dec.active) watching.push(p)
      else if (dec.ordered > 0) order.push(p)
      else hold.push(p)
      for (const mv of dec.moves) moves.push({ p, from: mv.from, to: mv.to, qty: mv.qty, rescue: !!mv.rescue })
    }
    const worth = (p: ItemPlan) => p.decisions[m].ordered * (rates.perUnit[p.item.code] ?? 0)
    order.sort((a, b) => worth(b) - worth(a))
    hold.sort((a, b) => (b.decisions[m].coverMonths ?? 0) - (a.decisions[m].coverMonths ?? 0))
    moves.sort((a, b) => b.qty * (rates.perUnit[b.p.item.code] ?? 0) - a.qty * (rates.perUnit[a.p.item.code] ?? 0))

    // Sets: say only what the records can support. If the six godowns together are short of a
    // part, parents truly cannot be fitted out and it must be ordered. If the part exists but in
    // another godown, it is a transfer, and the largest ones are listed.
    const sets = setsCheck.defs
      .map((def, si) => {
        const pooled = setsCheck.pooled[si][m]
        const flagged = godowns
          .map((_, g) => ({ g, kind: remedyOf(setsCheck, si, g, m), b: setsCheck.balance[si][g][m] }))
          .filter((x) => x.kind === 'move' || x.kind === 'order')
        const transfers = flagged
          .flatMap((x) => x.b.parts.filter((part) => part.status === 'short').map((part) => ({ g: x.g, child: part.child, qty: part.missing })))
          .sort((a, b) => b.qty * (rates.perUnit[b.child] ?? 0) - a.qty * (rates.perUnit[a.child] ?? 0))
        const missing = pooled.parts.filter((part) => part.status === 'short')
        return { def, flagged, transfers, missing, cannotFit: pooled.stranded, needsOrder: missing.length > 0 && pooled.stranded >= 1 }
      })
      .filter((s) => s.flagged.length > 0)
    return { order, hold, watching, moves, sets }
  }, [run, m, rates])

  const lines: Series[] = [
    { key: 'real', label: 'What really sat idle', color: REAL, values: money.real },
    { key: 'plan', label: 'With the planner', color: PLAN, values: money.plan },
  ]
  const cuts = project.items.map((i) => run.scores[i.code].idleCut).sort((a, b) => a - b)
  const medianCut = (cuts[7] + cuts[8]) / 2
  const never = project.items.filter((i) => run.scores[i.code].shortMonths === 0).length
  const ranked = [...project.items].sort((a, b) => run.scores[b.code].idleCut - run.scores[a.code].idleCut)

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="wide max-w-[22ch] text-[32px] font-extrabold leading-[1.05] tracking-[-0.015em] sm:text-[44px]">
          The story says 1,700 poles. The yard says 48,991.
        </h2>
        <p className="mt-3 max-w-[66ch] text-[16px] text-ink-2">
          Lumino's trucks kept to a fixed timetable while the site worked at its own pace, so material piled up. This
          tool tells the stores, every month, what to order, what to hold and what to move, from what the site actually
          used. Press play to replay the real project.
        </p>
      </div>

      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-cement/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex w-full min-w-0 md:w-auto md:flex-1">
          <Scrubber month={m} set={(next) => set({ month: next })} restart />
        </div>
        <ItemSelect value={sel.item} onChange={(item) => set({ item })} />
      </div>

      {/* ---- one item, three steps ---- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Step n={1} title="What happened">
          <div className="wide figures mt-2 text-[38px] font-extrabold leading-none">{qty(plan.realIdle[m])}</div>
          <div className="mt-1 text-[13.5px] text-ink-2">
            {unit} of {shortName(plan.item)} lying unused in {month}, worth {rupees(plan.realIdle[m] * rate)}
          </div>
          <div className="mt-3">
            <Pile filled={plan.realIdle[m] / per} slots={slots} color={REAL} label={`${qty(plan.realIdle[m])} ${unit} lying idle in reality`} />
          </div>
          <p className="mt-3 text-[14px]">
            {arrived > 0
              ? `${qty(arrived)} more arrived this month, on ${qty(deliveries)} ${deliveries === 1 ? 'delivery' : 'deliveries'}. The site used ${qty(l.used[m])}.` +
                (lasts !== null && lasts > plan.leadMonths + 2 ? ` What was already here would have lasted ${cover(lasts)} months.` : '')
              : plan.realIdle[m] > 0
                ? `No deliveries this month. The site used ${qty(l.used[m])} from the pile.`
                : 'Nothing has arrived yet.'}
          </p>
        </Step>

        <Step n={2} title="What the planner says">
          <div className="wide mt-2 text-[38px] font-extrabold leading-none">
            {!d.active ? 'Watch' : d.ordered > 0 ? 'Order' : 'Hold'}
          </div>
          <div className="mt-1 text-[13.5px] text-ink-2">
            {!d.active
              ? 'still learning how fast the site works'
              : d.ordered > 0
                ? `${qty(d.ordered)} ${unit}, to land in ${m + plan.leadMonths < months.length ? monthLabel(months[m + plan.leadMonths]) : `${plan.leadMonths} months`}`
                : 'order nothing this month'}
          </div>
          <p className="mt-3 text-[14px]">{reason(plan, m, unit)}</p>
          {d.moves.filter((mv) => !mv.rescue).length > 0 && (
            <p className="mt-2 text-[14px]">
              Move first:{' '}
              {d.moves
                .filter((mv) => !mv.rescue)
                .map((mv) => `${qty(mv.qty)} from ${place(mv.from)} to ${place(mv.to)}`)
                .join('; ')}
              .
            </p>
          )}
          <div className="mt-auto pt-4">
            <div className="text-[13px] text-ink-2">Arriving this month</div>
            {(
              [
                ['Really', arrived, REAL],
                ['In the plan', planArrived, PLAN],
              ] as const
            ).map(([label, value, color]) => (
              <div key={label} className="mt-1 flex items-center gap-2 text-[13.5px]">
                <span className="w-20 shrink-0">{label}</span>
                <span className="h-3 min-w-0 flex-1">
                  <span className="block h-full rounded-r-[3px]" style={{ width: `${(value / truckScale) * 100}%`, background: color }} />
                </span>
                <span className="figures narrow w-16 shrink-0 text-right font-semibold">{qty(value)}</span>
              </div>
            ))}
            {d.active && onTheRoad && (
              <p className="mt-1.5 text-[12.5px] text-muted">
                The same, for now: these trucks were ordered before the planner could act. Its own orders start landing in{' '}
                {monthLabel(months[plan.firstPlannedArrival])}.
              </p>
            )}
          </div>
        </Step>

        <Step n={3} title="With the planner">
          <div className="wide figures mt-2 text-[38px] font-extrabold leading-none">{qty(plan.idle[m])}</div>
          <div className="mt-1 text-[13.5px] text-ink-2">
            {unit} lying unused in {month}, worth {rupees(plan.idle[m] * rate)}
          </div>
          <div className="mt-3">
            <Pile filled={plan.idle[m] / per} slots={slots} color={PLAN} label={`${qty(plan.idle[m])} ${unit} lying idle in the plan`} />
          </div>
          <p className="mt-3 text-[14px]">
            {plan.waiting[m] > 1e-6
              ? `The site is waiting for ${qty(plan.waiting[m])} ${unit} this month.`
              : plan.realIdle[m] - plan.idle[m] >= per
                ? `${qty(plan.realIdle[m] - plan.idle[m])} fewer ${unit} lying idle than in reality, and the site has everything it needs.`
                : 'The same as reality so far, and the site has everything it needs.'}
          </p>
        </Step>
      </div>
      <p className="-mt-3 text-[12.5px] text-muted">
        Each mark is {qty(per)} {unit}. Both yards are drawn to the size of the real pile at its worst. Rupee figures use{' '}
        {assumed ? `an assumed ₹${qty(rate)} per unit, not Lumino's rate` : `your rate of ₹${qty(rate)} per unit`}.
      </p>

      {/* ---- the month's sheet, every item ---- */}
      <div>
        <h3 className="wide text-[22px] font-bold leading-tight">The sheet for {month}</h3>
        <p className="mt-1 max-w-[70ch] text-[14.5px] text-ink-2">
          The same three steps for all 16 items, on one page a purchase manager could act on. Open any line to see why.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <Group verb="Order" count={sheet.order.length} noun={sheet.order.length === 1 ? 'item' : 'items'} meaning="Stock on hand and on the way will not last until a new order lands.">
            {sheet.order.map((p) => {
              const dec = p.decisions[m]
              const u = unitWord(p.item.unit)
              return (
                <Line key={p.item.code} title={shortName(p.item)} action={`${qty(dec.ordered)} ${u}`}>
                  <p>{reason(p, m, u)}</p>
                  <p className="mt-1">
                    Send to {dec.orders.map((o) => `${place(o.godown)} ${qty(o.qty)}`).join(', ')}. In reality {qty(p.realDelivered[m])}{' '}
                    {u} arrived this month.
                  </p>
                </Line>
              )
            })}
          </Group>

          <Group verb="Hold" count={sheet.hold.length} noun={sheet.hold.length === 1 ? 'item' : 'items'} meaning="Already covered. Do not order.">
            {sheet.hold.map((p) => {
              const dec = p.decisions[m]
              const u = unitWord(p.item.unit)
              return (
                <Line
                  key={p.item.code}
                  title={shortName(p.item)}
                  action={dec.coverMonths === null ? 'not in use' : `${cover(dec.coverMonths)} months of cover`}
                  hint={p.realDelivered[m] > 0 ? `really, ${qty(p.realDelivered[m])} ${u} arrived` : undefined}
                >
                  <p>{reason(p, m, u)}</p>
                </Line>
              )
            })}
          </Group>

          <Group verb="Move" count={sheet.moves.length} noun={sheet.moves.length === 1 ? 'transfer' : 'transfers'} meaning="One godown is running low and another has spare. Cheaper and faster than buying.">
            {sheet.moves.slice(0, 6).map((mv, i) => (
              <div key={i} className="flex items-baseline gap-3 border-t border-rule py-2 text-[14px] first:border-t-0">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{shortName(mv.p.item)}</span>
                  <span className="ml-2 text-[12.5px] text-muted">
                    {place(mv.from)} to {place(mv.to)}
                    {mv.rescue ? ', sent mid-month when the godown ran out' : ''}
                  </span>
                </span>
                <span className="figures narrow shrink-0 font-semibold">
                  {qty(mv.qty)} {unitWord(mv.p.item.unit)}
                </span>
              </div>
            ))}
            {sheet.moves.length > 6 && (
              <details className="border-t border-rule pt-2 text-[13.5px]">
                <summary className="cursor-pointer text-ink-2">Show the other {sheet.moves.length - 6}</summary>
                {sheet.moves.slice(6).map((mv, i) => (
                  <div key={i} className="flex items-baseline gap-3 py-1">
                    <span className="min-w-0 flex-1">
                      {shortName(mv.p.item)}{' '}
                      <span className="text-muted">
                        {place(mv.from)} to {place(mv.to)}
                      </span>
                    </span>
                    <span className="figures narrow shrink-0">
                      {qty(mv.qty)} {unitWord(mv.p.item.unit)}
                    </span>
                  </div>
                ))}
              </details>
            )}
          </Group>

          <Group verb="Fix a set" count={sheet.sets.length} noun={sheet.sets.length === 1 ? 'set' : 'sets'} meaning="Some items only work together. If one part is short, the rest waits.">
            {sheet.sets.map((s) => (
              <Line
                key={s.def.parent}
                title={SET_PLURAL[s.def.parent] ?? itemName(s.def.parent)}
                action={s.needsOrder ? `${qty(Math.ceil(s.cannotFit))} cannot be fitted out` : 'parts in the wrong godown'}
                hint={s.needsOrder ? 'order the missing part' : 'move, do not buy'}
              >
                {s.needsOrder ? (
                  <p>
                    The six godowns together are short of{' '}
                    {s.missing.map((part) => `${qty(part.missing)} ${unitWord(project.items.find((i) => i.code === part.child)!.unit)} of ${itemName(part.child).toLowerCase()}`).join(' and ')}
                    . No transfer can fix that. It has to be ordered.
                  </p>
                ) : (
                  <p>
                    The project holds enough of every part, but not where the parents are. Out of step in{' '}
                    {s.flagged.map((x) => place(x.g)).join(', ')}.
                  </p>
                )}
                {s.transfers.length > 0 && (
                  <ul className="mt-1">
                    {s.transfers.slice(0, 3).map((t, i) => (
                      <li key={i}>
                        {place(t.g)} needs {qty(t.qty)} {unitWord(project.items.find((it) => it.code === t.child)!.unit)} of{' '}
                        {itemName(t.child).toLowerCase()}
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="mt-1 underline underline-offset-2" onClick={() => open('sets')}>
                  Open the set check
                </button>
              </Line>
            ))}
          </Group>
        </div>
        {sheet.watching.length > 0 && (
          <p className="mt-2 text-[13px] text-muted">
            Still watching {sheet.watching.length} {sheet.watching.length === 1 ? 'item' : 'items'}: the planner waits for three
            months of real usage before it decides.
          </p>
        )}
      </div>

      {/* ---- the result, the whole project ---- */}
      <div>
        <h3 className="wide text-[22px] font-bold leading-tight">Did it work?</h3>
        <p className="mt-1 max-w-[70ch] text-[14.5px] text-ink-2">
          The whole project, replayed with these sheets. Same site, same work, the same need met in the same months.
        </p>
        <section className="mt-3 rounded-md border border-rule bg-panel p-4">
          <div className="grid grid-cols-2 gap-y-4 lg:grid-cols-4">
            <Figure label="Idle stock, a typical item" value={`${percent(medianCut)} less`} hint="half of the 16 items lose more than this" />
            <Figure label="Money lying idle, on average" value={rupees(money.avgPlan)} hint={`really ${rupees(money.avgReal)}`} />
            <Figure
              label="Holding cost avoided"
              value={rupees(Math.max(0, money.carryReal - money.carryPlan))}
              hint={`at ${(rates.carryPerYear * 100).toFixed(0)}% a year, over ${months.length} months`}
            />
            <Figure label="Site kept waiting" value={`Never, on ${never} of 16`} hint="the other items are short for a month or two" />
          </div>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="text-[13px] text-ink-2">Value of everything lying idle, all 16 items together</div>
            <Legend series={lines} />
          </div>
          <div className="mt-1">
            <TimeChart
              months={months}
              ariaLabel="Value of idle stock, reality against the plan"
              unit="rupees"
              lines={lines}
              format={rupees}
              tickFormat={crore}
              cursor={m}
              onCursor={(next) => set({ month: next })}
              padLeft={64}
              height={220}
            />
          </div>
          <details className="mt-3 border-t border-rule pt-3">
            <summary className="cursor-pointer text-[14px] font-semibold">See all 16 items</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-[13.5px] whitespace-nowrap">
                <thead>
                  <tr className="text-right text-[12.5px] text-ink-2">
                    <th className="py-1.5 pr-3 text-left font-medium">Item</th>
                    <th className="px-3 py-1.5 font-medium">Idle on average, really</th>
                    <th className="px-3 py-1.5 font-medium">With the planner</th>
                    <th className="px-3 py-1.5 font-medium">Less idle</th>
                    <th className="py-1.5 pl-3 font-medium">Months the site waited</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((item) => {
                    const s = run.scores[item.code]
                    return (
                      <tr key={item.code} className="border-t border-rule">
                        <td className="py-1 pr-3 font-medium">
                          {shortName(item)} <span className="text-[12px] font-normal text-muted">{unitWord(item.unit)}</span>
                        </td>
                        <td className="figures narrow px-3 py-1 text-right">{qty(s.avgIdleReal)}</td>
                        <td className="figures narrow px-3 py-1 text-right font-semibold">{qty(s.avgIdlePlan)}</td>
                        <td className="figures narrow px-3 py-1 text-right">{s.idleCut > 0.005 ? percent(s.idleCut) : 'none'}</td>
                        <td className={`figures narrow py-1 pl-3 text-right ${s.shortMonths ? 'font-semibold text-critical' : 'text-axis'}`}>
                          {s.shortMonths || '–'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 max-w-[80ch] text-[12.5px] text-ink-2">
              Items showing none were bought almost entirely before the first unit was used. A planner that learns from
              usage cannot undo an order placed before there was any usage to learn from.
            </p>
          </details>
          {assumed && (
            <p className="mt-3 max-w-[80ch] text-[12.5px] text-muted">
              Lumino's data has no prices. Rupee figures use rough market rates assumed at the hackathon; the quantities
              are exact. The rate card is under Replay in detail.
            </p>
          )}
        </section>
      </div>

      {/* ---- the working ---- */}
      <div>
        <h3 className="wide text-[22px] font-bold leading-tight">The working</h3>
        <p className="mt-1 max-w-[70ch] text-[14.5px] text-ink-2">
          Lumino's brief asked for three jobs. Each has a page with every number behind this one.
        </p>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {(
            [
              ['see', 'Stock register', 'See it: every item and godown, month by month. What came in, what went out, what was used, what sat idle.'],
              ['plan', 'Replay in detail', 'Plan it: how the planner decides, its settings, the buffer trade-off and the rate card.'],
              ['sets', 'Set check', 'Match the sets: every godown and month where a set is out of step, and whether to move or order.'],
            ] as const
          ).map(([id, title, text], i) => (
            <li key={id}>
              <button type="button" onClick={() => open(id)} className="h-full w-full rounded-md border border-rule bg-panel p-4 text-left hover:border-ink">
                <span className="wide block text-[16px] font-bold">
                  {i + 1}. {title}
                </span>
                <span className="mt-1 block text-[13.5px] text-ink-2">{text}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
