// Job 1, "See it": the stock ledger.
//
// Two sums, straight from Lumino's note:
//   stock in a godown      = receipts + transfers in - transfers out - issues + returns
//   stock with contractors = issues - returns - consumption
// Both are added up from zero, month by month. Consumption has no godown, so the second sum
// exists for the whole project only.

import type { GodownFlows, Item, Project } from './types'

export const sum = (a: readonly number[]): number => a.reduce((s, x) => s + x, 0)

/** Removes float dust (0.1 + 0.2 style) without touching real quantities, which have at most 4 decimals. */
export const tidy = (x: number): number => Math.round(x * 1e6) / 1e6

/** Adds several monthly series together, month by month. */
export const addSeries = (...series: readonly number[][]): number[] =>
  series[0].map((_, m) => tidy(series.reduce((s, a) => s + a[m], 0)))

export interface GodownLedger extends GodownFlows {
  /** Stock at the start of the month. */
  opening: number[]
  /** Stock at the end of the month, never below zero. */
  closing: number[]
  /** The same running sum before the zero floor. A few late entries push it slightly negative. */
  raw: number[]
}

export function godownLedger(f: GodownFlows): GodownLedger {
  let running = 0
  const raw = f.rec.map((_, m) => {
    running += f.rec[m] + f.tin[m] - f.tout[m] - f.close[m] - f.iss[m] + f.ret[m]
    return tidy(running)
  })
  // The floor is applied for reading only. It is never carried forward, because the late entry
  // that fixes a dip arrives in the same running sum.
  const closing = raw.map((x) => Math.max(0, x))
  const opening = closing.map((_, m) => (m === 0 ? 0 : closing[m - 1]))
  return { ...f, opening, closing, raw }
}

export interface ItemLedger {
  item: Item
  months: string[]
  godowns: GodownLedger[]
  // Project-wide monthly flows (all six godowns added up).
  received: number[]
  transfersIn: number[]
  transfersOut: number[]
  toClosingStore: number[]
  issued: number[]
  returned: number[]
  used: number[]
  // Project-wide month-end positions.
  inGodowns: number[]
  withContractors: number[]
  /** Idle stock = sitting in godowns + sitting with contractors. */
  idle: number[]
  /** Average monthly usage over the trailing six months, as it was known at that month end. */
  usageRate: number[]
  /** How many months the idle stock would last at that usage rate. Null when nothing is being used. */
  coverMonths: (number | null)[]
  /** First month with any movement for this item. */
  firstMonth: number
}

export const USAGE_WINDOW = 6

/** Mean of the last `window` months up to and including `m`, never reaching back before `from`. */
export function trailingMean(series: readonly number[], m: number, window: number, from = 0): number {
  const start = Math.max(from, m - window + 1)
  if (m < start) return 0
  let total = 0
  for (let i = start; i <= m; i++) total += series[i]
  return total / (m - start + 1)
}

export function itemLedger(project: Project, code: string): ItemLedger {
  const item = project.items.find((i) => i.code === code)
  const flows = project.flows[code]
  if (!item || !flows) throw new Error(`Unknown item ${code}`)
  const godowns = flows.g.map(godownLedger)
  const across = (key: keyof GodownFlows) => addSeries(...flows.g.map((g) => g[key]))

  const received = across('rec')
  const issued = across('iss')
  const returned = across('ret')
  const used = flows.use

  let held = 0
  const withContractors = used.map((_, m) => {
    held += issued[m] - returned[m] - used[m]
    return Math.max(0, tidy(held))
  })
  const inGodowns = addSeries(...godowns.map((g) => g.closing))
  const idle = addSeries(inGodowns, withContractors)

  const moved = used.map((u, m) => u + received[m] + issued[m])
  const firstMonth = Math.max(0, moved.findIndex((x) => x > 0))
  const usageRate = used.map((_, m) => trailingMean(used, m, USAGE_WINDOW, firstMonth))
  const coverMonths = idle.map((x, m) => (usageRate[m] > 0 ? x / usageRate[m] : null))

  return {
    item,
    months: project.meta.months,
    godowns,
    received,
    transfersIn: across('tin'),
    transfersOut: across('tout'),
    toClosingStore: across('close'),
    issued,
    returned,
    used,
    inGodowns,
    withContractors,
    idle,
    usageRate,
    coverMonths,
    firstMonth,
  }
}

export interface ItemSummary {
  item: Item
  received: number
  used: number
  toClosingStore: number
  /** Still in the six godowns after the last entry. */
  endInGodowns: number
  /** Issued to contractors and never used or returned. */
  endWithContractors: number
  peakIdle: number
  peakIdleMonth: number
  /** Months of usage the peak pile represented, at the usage rate of that time. */
  peakCoverMonths: number | null
  /** Average idle stock over the project, in months of average usage. */
  avgCoverMonths: number
  /** Share of everything received that was not used by the end of the data. */
  unusedShare: number
}

export function summarise(l: ItemLedger): ItemSummary {
  const last = l.months.length - 1
  let peakIdleMonth = 0
  l.idle.forEach((x, m) => {
    if (x > l.idle[peakIdleMonth]) peakIdleMonth = m
  })
  const received = sum(l.received)
  const used = sum(l.used)
  const lastUse = l.used.findLastIndex((x) => x > 0)
  const firstUse = l.used.findIndex((x) => x > 0)
  const activeMonths = firstUse < 0 ? 0 : lastUse - firstUse + 1
  const avgUse = activeMonths ? used / activeMonths : 0
  const avgIdle = sum(l.idle) / l.idle.length
  return {
    item: l.item,
    received: tidy(received),
    used: tidy(used),
    toClosingStore: tidy(sum(l.toClosingStore)),
    endInGodowns: l.inGodowns[last],
    endWithContractors: l.withContractors[last],
    peakIdle: l.idle[peakIdleMonth],
    peakIdleMonth,
    peakCoverMonths: l.coverMonths[peakIdleMonth],
    avgCoverMonths: avgUse ? avgIdle / avgUse : 0,
    unusedShare: received ? Math.max(0, (received - used) / received) : 0,
  }
}
