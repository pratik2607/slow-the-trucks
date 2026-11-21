// Money. Lumino's data pack has no prices, so every rupee figure rests on a rate card.
// The quantities are exact; the rates are whatever the card says.

import type { ItemPlan } from './planner'

export interface RateCard {
  /** Rupees per unit of each item, in the item's own unit. */
  perUnit: Record<string, number>
  /** What it costs to hold stock for a year, as a share of its value: interest, storage, damage. */
  carryPerYear: number
}

/**
 * Placeholder rates. They are rough market guesses made at the hackathon, not Lumino's figures,
 * and the page says so wherever a rupee figure appears. Every one can be edited on the page.
 */
export const ASSUMED_RATES: RateCard = {
  perUnit: {
    MPO010014: 3200, // PCC pole 8.5 m, per piece
    MCA020009: 450000, // LT aerial bunched cable, per km
    MRP070022: 26, // 1x25 sq mm service cable, per metre
    MCA090005: 140, // suspension clamp
    MCO010007: 60, // wedge connector / PG clamp
    MEH050075: 240, // dead end clamp
    MRP070059: 120, // insulation piercing connector
    MRP070060: 250, // pole clamp, per set
    MRP070064: 1400, // single phase distribution box
    MRP070065: 2800, // three phase distribution box
    MEH050071: 90, // eye hook
    MLU020008: 9, // ring type lug
    MLU020013: 8, // lug
    MNB010007: 105, // hex bolts and nuts, per kg
    MNB010128: 100, // galvanised bolts and nuts, per kg
    MNB010174: 100000, // G.I. nuts and bolts, per tonne
  },
  carryPerYear: 0.12,
}

export interface ItemMoney {
  code: string
  rate: number
  avgReal: number
  avgPlan: number
  peakReal: number
  /** Holding cost avoided on this item over the project. */
  carrySaved: number
}

export interface MoneyView {
  /** Value of idle stock at each month end, all items together. */
  real: number[]
  plan: number[]
  peakReal: number
  peakRealMonth: number
  peakPlan: number
  peakPlanMonth: number
  avgReal: number
  avgPlan: number
  /** Cost of holding the idle stock over the whole project. */
  carryReal: number
  carryPlan: number
  /** Value of everything delivered. */
  boughtReal: number
  boughtPlan: number
  /** Value of what was bought and never needed by the time the records end. */
  unusedReal: number
  unusedPlan: number
  byItem: ItemMoney[]
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
const peakOf = (xs: readonly number[]): number => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0)

export function moneyView(plans: Record<string, ItemPlan>, rates: RateCard): MoneyView {
  const codes = Object.keys(plans)
  const N = plans[codes[0]].idle.length
  const real = new Array<number>(N).fill(0)
  const plan = new Array<number>(N).fill(0)
  const monthly = rates.carryPerYear / 12
  let boughtReal = 0
  let boughtPlan = 0
  let needed = 0

  const byItem = codes.map((code) => {
    const p = plans[code]
    const rate = rates.perUnit[code] ?? 0
    for (let m = 0; m < N; m++) {
      real[m] += p.realIdle[m] * rate
      plan[m] += p.idle[m] * rate
    }
    boughtReal += sum(p.realDelivered) * rate
    boughtPlan += sum(p.delivered) * rate
    needed += sum(p.needTotal) * rate
    return {
      code,
      rate,
      avgReal: (sum(p.realIdle) / N) * rate,
      avgPlan: (sum(p.idle) / N) * rate,
      peakReal: Math.max(...p.realIdle) * rate,
      carrySaved: (sum(p.realIdle) - sum(p.idle)) * rate * monthly,
    }
  })

  const peakRealMonth = peakOf(real)
  const peakPlanMonth = peakOf(plan)
  return {
    real,
    plan,
    peakReal: real[peakRealMonth],
    peakRealMonth,
    peakPlan: plan[peakPlanMonth],
    peakPlanMonth,
    avgReal: sum(real) / N,
    avgPlan: sum(plan) / N,
    carryReal: sum(real) * monthly,
    carryPlan: sum(plan) * monthly,
    boughtReal,
    boughtPlan,
    unusedReal: Math.max(0, boughtReal - needed),
    unusedPlan: Math.max(0, boughtPlan - needed),
    byItem,
  }
}
