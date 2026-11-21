// Section 2: follow the material. Vendor, godown, contractor, site: the route everyone at Lumino
// already knows, shown for one month in both worlds. The site figure is the same in both, which
// is the point: the plan changes where material waits, never how much work gets done.

import type { ReactNode } from 'react'
import { Pile, unitsPerMark } from '../../components/pile'
import { Badge, Chip, type Playback } from '../../components/ui'
import { monthLabel, qty, shortName, unitWord } from '../../lib/format'
import { ledgers, months, POLE, project, type Replay, type Selection } from '../../model'
import { ACTUAL, Card, Dot, PLAN, place, reason, Section, StationIcon } from './shared'

function Arrow() {
  return (
    <div aria-hidden className="flex items-center justify-center text-axis">
      <svg width="20" height="20" viewBox="0 0 20 20" className="rotate-90 lg:rotate-0">
        <path d="M4 10h11M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function Station({ kind, name, means, children }: { kind: 'vendor' | 'godown' | 'contractor' | 'site'; name: string; means: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cement text-ink">
        <StationIcon kind={kind} />
      </span>
      <span>
        <span className="block text-[15px] font-semibold leading-tight">{name}</span>
        <span className="block text-[12.5px] text-muted">{means}</span>
      </span>
      {children}
    </div>
  )
}

function Reading({ color, label, value, unit }: { color: string; label: string; value: number; unit: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex w-[4.75rem] shrink-0 items-center gap-1.5 text-[13px] text-ink-2">
        <Dot color={color} />
        {label}
      </span>
      <span className="figures narrow text-[22px] font-bold leading-none">{qty(value)}</span>
      <span className="text-[12px] text-muted">{unit}</span>
    </div>
  )
}

export function Flow({ sel, run, play }: { sel: Selection; run: Replay; play: Playback }) {
  const m = sel.month
  const N = months.length
  const month = monthLabel(months[m])
  const plan = run.plans[sel.item]
  const l = ledgers[sel.item]
  const unit = unitWord(plan.item.unit)
  const name = shortName(plan.item)
  const d = plan.decisions[m]
  const L = plan.leadMonths
  const usage = run.settings.signal === 'usage'

  const ahead = (xs: readonly number[]) => {
    let s = 0
    for (let k = m + 1; k <= Math.min(N - 1, m + L); k++) s += xs[k]
    return s
  }
  let used = 0
  for (let k = 0; k <= m; k++) used += plan.needTotal[k]

  const idleActual = plan.realIdle[m]
  const idlePlan = plan.idle[m]
  const fewer = idleActual - idlePlan
  const peakMonth = plan.realIdle.reduce((best, x, i) => (x > plan.realIdle[best] ? i : best), 0)
  const per = unitsPerMark(plan.realIdle[peakMonth])
  const slots = Math.max(1, Math.ceil(plan.realIdle[peakMonth] / per))
  const arrived = plan.realDelivered[m]
  const planArrived = plan.delivered[m]
  const truckScale = Math.max(arrived, planArrived, 1)
  const deliveries = project.flows[sel.item].g.reduce((s, g) => s + g.recN[m], 0)
  const waiting = plan.waiting[m]

  const moments = [
    { m: 0, label: 'Start' },
    { m: plan.takeover, label: 'Planner starts deciding' },
    { m: plan.firstPlannedArrival, label: 'Its first order lands' },
    { m: peakMonth, label: 'Worst month' },
    { m: N - 1, label: 'End' },
  ].filter((k, i, all) => k.m < N && all.findIndex((x) => x.m === k.m) === i)

  const narration =
    m < plan.takeover
      ? 'The planner is only watching. It waits for three months of real usage before it decides anything, so both worlds are the same.'
      : m < plan.firstPlannedArrival
        ? `The planner is deciding now, but trucks ordered earlier are still on the road and it cannot stop them. Its own first order lands in ${monthLabel(months[plan.firstPlannedArrival])}.`
        : m === N - 1
          ? `The work is done. The site used the same ${qty(used)} ${unit} in both worlds, in the same months.`
          : m === peakMonth
            ? `The worst month. ${qty(idleActual)} ${unit} lying unused in reality, ${qty(idlePlan)} with the plan.`
            : waiting > 1e-6
              ? `The plan runs short this month: the site is waiting for ${qty(waiting)} ${unit}.`
              : fewer >= per
                ? `${qty(fewer)} fewer ${unit} lying unused than in reality, and the site has everything it needs.`
                : 'The two worlds are close this month, and the site has everything it needs.'

  return (
    <Section
      id="flow"
      n={2}
      question="Where does the material sit?"
      lead={
        sel.item === POLE
          ? "Lumino's brief tells of 1,700 poles lying idle because nobody slowed the trucks. Its own records show the pile reached 48,991. Follow them from vendor to site, month by month, in both worlds."
          : `Idle stock of ${name} peaked at ${qty(plan.realIdle[peakMonth])} ${unit} in ${monthLabel(months[peakMonth])}. Follow it from vendor to site, month by month, in both worlds.`
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-ink-2">Jump to</span>
        {moments.map((k) => (
          <Chip key={k.label} active={k.m === m} onClick={() => play.jump(k.m)}>
            {k.label}
          </Chip>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,2.5fr)_auto_minmax(0,1fr)] lg:items-stretch">
        <Card className="flex flex-col gap-4 p-5">
          <Station kind="vendor" name="Vendor" means="ordered, on the way" />
          <div className="grid gap-2.5">
            <Reading color={ACTUAL} label="Actual" value={ahead(plan.realDelivered)} unit={unit} />
            <Reading color={PLAN} label="Our plan" value={ahead(plan.delivered)} unit={unit} />
          </div>
          <p className="mt-auto text-[12.5px] text-muted">The plan keeps stock on the road, not in the yard.</p>
        </Card>

        <Arrow />

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Station kind="godown" name="Godown" means="lying in store" />
              <Station kind="contractor" name="Contractor" means="issued, not yet used" />
            </div>
            {fewer >= per ? <Badge tone="saved">{qty(fewer)} fewer lying unused</Badge> : waiting > 1e-6 ? <Badge tone="wait">site waiting</Badge> : <Badge>about the same</Badge>}
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <Dot color={ACTUAL} /> Actual
              </div>
              <div className="wide figures mt-1 text-[36px] font-extrabold leading-none tracking-[-0.02em]">{qty(idleActual)}</div>
              <div className="mt-1.5 text-[12.5px] text-muted">
                {usage ? `${qty(l.inGodowns[m])} in godowns, ${qty(l.withContractors[m])} with contractors` : `${unit} in godowns`}
              </div>
              <div className="mt-3">
                <Pile filled={idleActual / per} slots={slots} color={ACTUAL} label={`${qty(idleActual)} ${unit} lying unused in reality`} />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[13px] text-ink-2">
                <Dot color={PLAN} /> Our plan
              </div>
              <div className="wide figures mt-1 text-[36px] font-extrabold leading-none tracking-[-0.02em]">{qty(idlePlan)}</div>
              <div className="mt-1.5 text-[12.5px] text-muted">
                {usage ? `${unit}, in godowns or with contractors` : `${unit} in godowns`}
              </div>
              <div className="mt-3">
                <Pile filled={idlePlan / per} slots={slots} color={PLAN} label={`${qty(idlePlan)} ${unit} lying unused in the plan`} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-muted">
            Each mark is {qty(per)} {unit}. Both yards are drawn to the size of the real pile at its worst.
          </p>
        </Card>

        <Arrow />

        <Card className="flex flex-col gap-4 p-5">
          <Station kind="site" name="Site" means="used so far" />
          <div>
            <div className="figures narrow text-[22px] font-bold leading-none">
              {qty(used)} <span className="text-[12px] font-normal text-muted">{unit}</span>
            </div>
            <div className="mt-2">{waiting > 1e-6 ? <Badge tone="wait">plan short by {qty(waiting)}</Badge> : <Badge tone="saved">same in both</Badge>}</div>
          </div>
          <p className="mt-auto text-[12.5px] text-muted">The same work gets done. Only the waiting changes.</p>
        </Card>
      </div>

      <p aria-live="polite" className="mt-4 rounded-xl bg-ink px-4 py-3 text-[15px] leading-snug text-panel">
        <span className="figures mr-2 font-bold">{month}.</span>
        {narration}
      </p>

      <Card className="mt-4 grid gap-x-8 gap-y-5 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <div className="text-[13px] text-ink-2">The planner's call on {name} for {month}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="wide text-[30px] font-extrabold leading-none tracking-[-0.02em]">{!d.active ? 'Watch' : d.ordered > 0 ? 'Order' : 'Hold'}</span>
            <span className="text-[15px] font-semibold">
              {!d.active
                ? 'still learning how fast the site works'
                : d.ordered > 0
                  ? `${qty(d.ordered)} ${unit}, to land in ${m + L < N ? monthLabel(months[m + L]) : `${L} months`}`
                  : 'order nothing this month'}
            </span>
          </div>
          <p className="mt-2 max-w-[64ch] text-[14px] leading-relaxed text-ink-2">{reason(plan, m, unit)}</p>
          {d.moves.some((mv) => !mv.rescue) && (
            <p className="mt-1.5 text-[14px] text-ink-2">
              Move first:{' '}
              {d.moves
                .filter((mv) => !mv.rescue)
                .map((mv) => `${qty(mv.qty)} from ${place(mv.from)} to ${place(mv.to)}`)
                .join('; ')}
              .
            </p>
          )}
        </div>
        <div>
          <div className="text-[13px] text-ink-2">Trucks arriving in {month}</div>
          {(
            [
              ['Actual', arrived, 'bg-real'],
              ['Our plan', planArrived, 'bg-plan'],
            ] as const
          ).map(([label, value, bar]) => (
            <div key={label} className="mt-2 flex items-center gap-3 text-[13.5px]">
              <span className="w-16 shrink-0 text-ink-2">{label}</span>
              <span className="h-2.5 min-w-0 flex-1 rounded-full bg-cement">
                <span className={`block h-full rounded-full ${bar}`} style={{ width: `${(value / truckScale) * 100}%` }} />
              </span>
              <span className="figures narrow w-16 shrink-0 text-right font-bold">{qty(value)}</span>
            </div>
          ))}
          <p className="mt-2 text-[12.5px] text-muted">
            {arrived > 0 ? `In reality that was ${qty(deliveries)} ${deliveries === 1 ? 'delivery' : 'deliveries'}, while the site used ${qty(l.used[m])}.` : `The site used ${qty(l.used[m])} this month.`}
          </p>
        </div>
      </Card>
    </Section>
  )
}
