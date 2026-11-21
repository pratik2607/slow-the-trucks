// Job 2, "Plan it": replay the project month by month.
//
// At the start of each month the planner sees only what was recorded before that month. It then
// says what to move between godowns, what to order, or to hold. The month then plays out against
// what really happened, so the plan can be put next to reality.
//
// Kept the same in both worlds, so the comparison is fair:
//   - what the site really needed, in the month it needed it (see `Signal` below)
//   - every delivery that had already been ordered before the planner had anything to learn from
//
// What the planner controls: new orders, which land one lead time later, and transfers between
// the six godowns. Real transfers stop at takeover, because they were reactions to the real pile.

import { tidy } from './ledger'
import type { Item, Project } from './types'

/**
 * What counts as the site's need.
 *
 * 'usage'  - what was actually used at site. Idle stock is then everything that has arrived and
 *            has not been used, whether it sits in a godown or with a contractor. This is the
 *            arithmetic in Lumino's own story: 3,000 arrived, 1,300 put up, 1,700 idle.
 *            Lumino records usage for the whole project, so each month's usage is split between
 *            godowns in proportion to what each had issued to contractors so far. That split is
 *            an estimate; the project totals are exact.
 * 'issues' - what contractors drew from each godown, net of returns. Stricter and exact per
 *            godown, but it counts material pushed out to contractors as if it had been needed.
 */
export type Signal = 'usage' | 'issues'

export interface PlanSettings {
  signal: Signal
  /**
   * How cautious the buffer is, in standard deviations of monthly need.
   * 0 keeps no buffer; about 1.65 would cover 19 months in 20 if need were bell-shaped.
   */
  caution: number
  /** Months of real history the planner waits for before it starts deciding. */
  warmup: number
  /**
   * A planner always knows the contract quantity. The data pack does not include it, so the
   * stand-in is what Lumino finally bought: with this on, the plan never orders more than that.
   */
  knowsTotal: boolean
}

export const DEFAULT_SETTINGS: PlanSettings = { signal: 'usage', caution: 2.5, warmup: 3, knowsTotal: true }

export interface Move {
  from: number
  to: number
  qty: number
  /** True for a transfer made during the month because a godown ran out. */
  rescue?: boolean
}

export interface MonthDecision {
  /** False until the planner has taken over. Before that the plan is simply what happened. */
  active: boolean
  /** Expected need per month across the project, from recent real need. */
  forecast: number
  /** Extra stock held against bumpy need. */
  buffer: number
  /** What the project should have on hand plus on the way. */
  target: number
  /** What it has at the start of the month. Negative means the site is waiting. */
  onHand: number
  /** Already ordered and due within the lead time. */
  onTheWay: number
  /** Months the on-hand and on-the-way stock would last at the forecast. Null if nothing is needed. */
  coverMonths: number | null
  orders: { godown: number; qty: number }[]
  ordered: number
  moves: Move[]
  /** True when the order was cut because the project's total quantity was reached. */
  capped: boolean
}

export interface ItemPlan {
  item: Item
  settings: PlanSettings
  leadMonths: number
  /** First month the planner decides. */
  takeover: number
  /** First month a delivery ordered by the planner can land. */
  firstPlannedArrival: number
  /** The most the plan may ever have delivered. Null when the planner is not told the total. */
  total: number | null
  /** [godown][month] the site's need, the same in both worlds. */
  need: number[][]
  /** [godown][month] stock at month end in the plan world. Negative = the site kept waiting. */
  stock: number[][]
  /** [godown][month] the same sum for what really happened. */
  realStock: number[][]
  /** [godown][month] deliveries in the plan world: committed ones, then the planner's own. */
  arrivals: number[][]
  decisions: MonthDecision[]
  // Project-wide monthly series, plan next to reality.
  idle: number[]
  waiting: number[]
  delivered: number[]
  realIdle: number[]
  realDelivered: number[]
  needTotal: number[]
}

const DECIMAL_UNITS = new Set(['KG', 'MT', 'KM', 'MTR'])

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function spread(xs: readonly number[]): number {
  if (xs.length < 2) return 0
  const mu = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - mu) ** 2)))
}

/** Lead times in the data are 30, 60, 90, 120 and 150 days: whole months. */
export const leadMonthsOf = (item: Item): number => Math.max(1, Math.round(item.leadDays / 30))

/** The site's need per godown and month, under the chosen signal. Uses nothing after each month. */
export function needByGodown(project: Project, code: string, signal: Signal): number[][] {
  const flows = project.flows[code]
  const N = project.meta.months.length
  const netIssues = flows.g.map((g) => g.iss.map((x, m) => x - g.ret[m]))
  if (signal === 'issues') return netIssues

  // Split cumulative usage by each godown's share of cumulative net issues, then take differences.
  const need = flows.g.map(() => new Array<number>(N).fill(0))
  const issuedSoFar = flows.g.map(() => 0)
  const usedBefore = flows.g.map(() => 0)
  let usedSoFar = 0
  for (let m = 0; m < N; m++) {
    usedSoFar += flows.use[m]
    netIssues.forEach((d, g) => (issuedSoFar[g] += d[m]))
    const all = issuedSoFar.reduce((a, b) => a + Math.max(0, b), 0)
    flows.g.forEach((_, g) => {
      const share = all > 0 ? Math.max(0, issuedSoFar[g]) / all : 1 / flows.g.length
      const usedHere = usedSoFar * share
      need[g][m] = tidy(usedHere - usedBefore[g])
      usedBefore[g] = usedHere
    })
  }
  return need
}

export function planItem(project: Project, code: string, settings: PlanSettings = DEFAULT_SETTINGS): ItemPlan {
  const item = project.items.find((i) => i.code === code)
  const flows = project.flows[code]
  if (!item || !flows) throw new Error(`Unknown item ${code}`)

  const N = project.meta.months.length
  const G = flows.g.length
  const L = leadMonthsOf(item)
  const need = needByGodown(project, code, settings.signal)
  const needTotal = Array.from({ length: N }, (_, m) => need.reduce((s, d) => s + d[m], 0))

  // What really happened, on the same sum the plan uses: everything that reached a godown,
  // less what left it for another store, less the site's need.
  const realStock = flows.g.map((g, gi) => {
    let running = 0
    return g.rec.map((_, m) => tidy((running += g.rec[m] + g.tin[m] - g.tout[m] - g.close[m] - need[gi][m])))
  })

  let firstNeed = N
  for (let m = 0; m < N; m++) {
    if (needTotal[m] > 0) {
      firstNeed = m
      break
    }
  }
  const takeover = Math.min(N, firstNeed + settings.warmup)
  const firstPlannedArrival = Math.min(N, takeover + L)
  const total = settings.knowsTotal ? flows.g.reduce((s, g) => s + g.rec.reduce((a, b) => a + b, 0), 0) : null

  const whole = !DECIMAL_UNITS.has(item.unit)
  const up = (x: number) => (whole ? Math.ceil(x - 1e-9) : Math.ceil(x * 1000 - 1e-6) / 1000)
  const down = (x: number) => (whole ? Math.floor(x + 1e-9) : Math.floor(x * 1000 + 1e-6) / 1000)

  const stock = Array.from({ length: G }, () => new Array<number>(N).fill(0))
  const arrivals = Array.from({ length: G }, () => new Array<number>(N).fill(0))
  // Anything landing before takeover + lead time was ordered before the planner could act.
  let scheduled = 0
  for (let g = 0; g < G; g++) {
    for (let m = 0; m < firstPlannedArrival; m++) {
      arrivals[g][m] = flows.g[g].rec[m]
      scheduled += arrivals[g][m]
    }
  }

  const X = new Array<number>(G).fill(0)
  const decisions: MonthDecision[] = []

  for (let m = 0; m < N; m++) {
    if (m < takeover) {
      // Before takeover the plan world is the real world, transfers and all.
      for (let g = 0; g < G; g++) {
        X[g] = realStock[g][m]
        stock[g][m] = X[g]
      }
      decisions.push({
        active: false,
        forecast: 0,
        buffer: 0,
        target: 0,
        onHand: 0,
        onTheWay: 0,
        coverMonths: null,
        orders: [],
        ordered: 0,
        moves: [],
        capped: false,
      })
      continue
    }

    // ---- decide, from months before m only ------------------------------------------------------
    const since = (window: number) => Math.max(firstNeed, m - window)
    const rate = (series: readonly number[]) =>
      Math.max(0, mean(series.slice(since(3), m)), mean(series.slice(since(6), m)))
    const f = need.map(rate)
    const bump = need.map((d) => spread(d.slice(since(12), m)))
    const F = f.reduce((a, b) => a + b, 0)
    const buffer = settings.caution * spread(needTotal.slice(since(12), m)) * Math.sqrt(L + 1)

    const onTheWay = arrivals.map((a) => {
      let s = 0
      for (let k = m; k < Math.min(N, m + L); k++) s += a[k]
      return s
    })
    const onHand = X.reduce((a, b) => a + b, 0)
    const pipeline = onTheWay.reduce((a, b) => a + b, 0)
    // The order placed now lands at the start of month m + L, and the next one a month after that.
    // So stock on hand and on the way has to carry L + 1 months of need, plus the buffer.
    const target = F * (L + 1) + buffer
    let ordered = Math.max(0, target - (onHand + pipeline))
    let capped = false
    if (total !== null && ordered > total - scheduled) {
      ordered = Math.max(0, total - scheduled)
      capped = true
    }

    // Move before buying: every godown should start the month with one month of its own need plus
    // its buffer. One that has less takes from the ones that have more.
    const have = X.map((x, g) => x + arrivals[g][m])
    const floor = f.map((fg, g) => fg + settings.caution * bump[g])
    const short = have.map((h, g) => Math.max(0, floor[g] - h))
    const spare = have.map((h, g) => Math.max(0, h - floor[g]))
    const moves: Move[] = []
    const takers = short.map((_, g) => g).filter((g) => short[g] > 0).sort((a, b) => short[b] - short[a])
    for (const to of takers) {
      const givers = spare.map((_, g) => g).filter((g) => g !== to && spare[g] > 0).sort((a, b) => spare[b] - spare[a])
      for (const from of givers) {
        const q = down(Math.min(short[to], spare[from]))
        if (q <= 0) continue
        moves.push({ from, to, qty: q })
        X[from] -= q
        X[to] += q
        spare[from] -= q
        short[to] -= q
        if (short[to] <= 0) break
      }
    }

    // Then order what the whole project is short of, sent to the godowns that are short.
    const gap = f.map((fg, g) => Math.max(0, fg * (L + 1) + buffer * (F > 0 ? fg / F : 1 / G) - (X[g] + onTheWay[g])))
    const gapTotal = gap.reduce((a, b) => a + b, 0)
    const orders: { godown: number; qty: number }[] = []
    if (ordered > 0 && gapTotal > 0) {
      let left = total === null ? Infinity : Math.max(0, total - scheduled)
      for (let g = 0; g < G; g++) {
        const q = Math.min(up((ordered * gap[g]) / gapTotal), down(left))
        if (q <= 0) continue
        orders.push({ godown: g, qty: q })
        left -= q
        scheduled += q
        if (m + L < N) arrivals[g][m + L] += q
      }
    }

    decisions.push({
      active: true,
      forecast: F,
      buffer,
      target,
      onHand: tidy(onHand),
      onTheWay: tidy(pipeline),
      coverMonths: F > 0 ? (onHand + pipeline) / F : null,
      orders,
      ordered: tidy(orders.reduce((s, o) => s + o.qty, 0)),
      moves,
      capped,
    })

    // ---- then the month happens -------------------------------------------------------------------
    for (let g = 0; g < G; g++) X[g] = tidy(X[g] + arrivals[g][m] - need[g][m])

    // The godowns sit in neighbouring districts. If one runs out during the month, the others send
    // what they still have. This reacts to the shortfall as it appears; it looks at nothing ahead.
    const dry = X.map((_, g) => g).filter((g) => X[g] < 0).sort((a, b) => X[a] - X[b])
    for (const to of dry) {
      const givers = X.map((_, g) => g).filter((g) => X[g] > 0).sort((a, b) => X[b] - X[a])
      for (const from of givers) {
        const q = Math.min(up(-X[to]), down(X[from]))
        if (q <= 0) continue
        moves.push({ from, to, qty: q, rescue: true })
        X[from] = tidy(X[from] - q)
        X[to] = tidy(X[to] + q)
        if (X[to] >= 0) break
      }
    }
    for (let g = 0; g < G; g++) stock[g][m] = X[g]
  }

  const across = (pick: (g: number, m: number) => number) =>
    Array.from({ length: N }, (_, m) => {
      let s = 0
      for (let g = 0; g < G; g++) s += pick(g, m)
      return tidy(s)
    })

  return {
    item,
    settings,
    leadMonths: L,
    takeover,
    firstPlannedArrival,
    total,
    need,
    stock,
    realStock,
    arrivals,
    decisions,
    idle: across((g, m) => Math.max(0, stock[g][m])),
    waiting: across((g, m) => Math.max(0, -stock[g][m])),
    delivered: across((g, m) => arrivals[g][m]),
    realIdle: across((g, m) => Math.max(0, realStock[g][m])),
    realDelivered: across((g, m) => flows.g[g].rec[m]),
    needTotal: needTotal.map(tidy),
  }
}

export interface PlanScore {
  /** Average idle stock over the whole project. */
  avgIdleReal: number
  avgIdlePlan: number
  /** Share of idle stock the plan removes. 0.4 = 40% less. */
  idleCut: number
  peakIdleReal: number
  peakIdlePlan: number
  peakMonthReal: number
  peakMonthPlan: number
  /** Godown-months in which a godown could not fully cover the site's need. */
  shortGodownMonths: number
  /** Months in which any godown was short. */
  shortMonths: number
  /** The most the site was ever kept waiting for, across the project. */
  worstWaiting: number
  /** Share of the real need the plan would have met in the month it arose. */
  servedOnTime: number
  /** Months in which the six godowns together did not hold enough, however it was shared out. */
  projectShortMonths: number
  /** Share of the real need met on time if stock could always reach the godown that needed it. */
  projectServedOnTime: number
  /** Number of transfers the plan asks for, and how much they carry in total. */
  moveCount: number
  moveQty: number
  deliveredReal: number
  deliveredPlan: number
  endIdleReal: number
  endIdlePlan: number
}

export function scorePlan(p: ItemPlan): PlanScore {
  const N = p.idle.length
  const G = p.stock.length
  const avg = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const argmax = (xs: readonly number[]) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0)

  let asked = 0
  let onTime = 0
  let shortGodownMonths = 0
  for (let m = p.takeover; m < N; m++) {
    for (let g = 0; g < G; g++) {
      if (p.stock[g][m] < -1e-6) shortGodownMonths++
      const d = p.need[g][m]
      if (d <= 0) continue
      // What was there to meet this month's need, after anything still owed from earlier months.
      const available = p.stock[g][m] + d
      asked += d
      onTime += Math.min(d, Math.max(0, available))
    }
  }

  let projectShortMonths = 0
  let projectAsked = 0
  let projectOnTime = 0
  let moveCount = 0
  let moveQty = 0
  for (let m = p.takeover; m < N; m++) {
    let pooled = 0
    for (let g = 0; g < G; g++) pooled += p.stock[g][m]
    if (pooled < -1e-6) projectShortMonths++
    const d = p.needTotal[m]
    if (d > 0) {
      projectAsked += d
      projectOnTime += Math.min(d, Math.max(0, pooled + d))
    }
    moveCount += p.decisions[m].moves.length
    moveQty += p.decisions[m].moves.reduce((s, mv) => s + mv.qty, 0)
  }

  const avgIdleReal = avg(p.realIdle)
  const avgIdlePlan = avg(p.idle)
  const peakMonthReal = argmax(p.realIdle)
  const peakMonthPlan = argmax(p.idle)
  return {
    avgIdleReal,
    avgIdlePlan,
    idleCut: avgIdleReal > 0 ? 1 - avgIdlePlan / avgIdleReal : 0,
    peakIdleReal: p.realIdle[peakMonthReal],
    peakIdlePlan: p.idle[peakMonthPlan],
    peakMonthReal,
    peakMonthPlan,
    shortGodownMonths,
    shortMonths: p.waiting.filter((w) => w > 1e-6).length,
    worstWaiting: Math.max(0, ...p.waiting),
    servedOnTime: asked > 0 ? onTime / asked : 1,
    projectShortMonths,
    projectServedOnTime: projectAsked > 0 ? projectOnTime / projectAsked : 1,
    moveCount,
    moveQty: tidy(moveQty),
    deliveredReal: tidy(p.realDelivered.reduce((a, b) => a + b, 0)),
    deliveredPlan: tidy(p.delivered.reduce((a, b) => a + b, 0)),
    endIdleReal: p.realIdle[N - 1],
    endIdlePlan: p.idle[N - 1],
  }
}
