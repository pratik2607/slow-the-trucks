import { describe, expect, it } from 'vitest'
import { project } from '../data'
import { DEFAULT_SETTINGS, leadMonthsOf, needByGodown, planItem, scorePlan, type PlanSettings } from './planner'
import type { Project } from './types'

const POLE = 'MPO010014'
const N = project.meta.months.length

/** A copy of the project with every recorded quantity after `month` wiped. */
function forgetAfter(month: number, keepReceipts: boolean): Project {
  const copy: Project = JSON.parse(JSON.stringify(project))
  for (const flows of Object.values(copy.flows)) {
    for (let m = month + 1; m < N; m++) {
      flows.use[m] = 0
      for (const g of flows.g) {
        g.iss[m] = g.ret[m] = g.tin[m] = g.tout[m] = g.close[m] = 0
        if (!keepReceipts) g.rec[m] = g.recN[m] = 0
      }
    }
  }
  return copy
}

describe('what the site needed', () => {
  it('adds up to project usage in every month, however it is split between godowns', () => {
    for (const item of project.items) {
      const need = needByGodown(project, item.code, 'usage')
      project.flows[item.code].use.forEach((used, m) => {
        const split = need.reduce((s, g) => s + g[m], 0)
        expect(split).toBeCloseTo(used, 2)
      })
    }
  })

  it('is issues less returns, per godown, under the stricter signal', () => {
    const need = needByGodown(project, POLE, 'issues')
    const g0 = project.flows[POLE].g[0]
    expect(need[0][10]).toBe(g0.iss[10] - g0.ret[10])
  })
})

describe('the replay sees only the past', () => {
  // The heart of Job 2: a decision made in month t must not move when anything after t changes.
  it('makes the same decisions when everything after a month is wiped', () => {
    const settings: PlanSettings = { ...DEFAULT_SETTINGS, knowsTotal: false }
    for (const cutoff of [14, 22, 31]) {
      const blind = forgetAfter(cutoff, false)
      for (const item of project.items) {
        const full = planItem(project, item.code, settings)
        // Deliveries ordered before takeover are open orders the planner legitimately knows about,
        // so compare only once those have all landed.
        if (cutoff < full.firstPlannedArrival) continue
        const cut = planItem(blind, item.code, settings)
        for (let m = 0; m <= cutoff; m++) {
          expect(cut.decisions[m].orders, `${item.code} orders in month ${m}`).toEqual(full.decisions[m].orders)
          expect(cut.decisions[m].moves.filter((mv) => !mv.rescue)).toEqual(full.decisions[m].moves.filter((mv) => !mv.rescue))
        }
      }
    }
  })

  it('still holds for both signals when the project total is known', () => {
    for (const signal of ['usage', 'issues'] as const) {
      const settings: PlanSettings = { ...DEFAULT_SETTINGS, signal }
      const blind = forgetAfter(24, true)
      const full = planItem(project, POLE, settings)
      const cut = planItem(blind, POLE, settings)
      for (let m = 0; m <= 24; m++) expect(cut.decisions[m].orders).toEqual(full.decisions[m].orders)
    }
  })
})

describe('the plan world obeys the same arithmetic as the real one', () => {
  const plan = planItem(project, POLE)

  it('is identical to reality until the planner takes over', () => {
    for (let m = 0; m < plan.takeover; m++) {
      plan.stock.forEach((g, gi) => expect(g[m]).toBe(plan.realStock[gi][m]))
      expect(plan.decisions[m].active).toBe(false)
    }
    expect(plan.takeover).toBeGreaterThan(0)
  })

  it('keeps every delivery that was ordered before takeover', () => {
    for (let m = 0; m < plan.firstPlannedArrival; m++) expect(plan.delivered[m]).toBe(plan.realDelivered[m])
  })

  it('lands each order exactly one lead time after it was placed', () => {
    const L = leadMonthsOf(plan.item)
    expect(L).toBe(5)
    for (let m = plan.firstPlannedArrival; m < N; m++) {
      expect(plan.delivered[m]).toBeCloseTo(plan.decisions[m - L].ordered, 3)
    }
  })

  it('conserves stock: moves between godowns never create or destroy any', () => {
    for (let m = plan.takeover; m < N; m++) {
      const before = plan.stock.reduce((s, g) => s + g[m - 1], 0)
      const after = plan.stock.reduce((s, g) => s + g[m], 0)
      expect(after - before).toBeCloseTo(plan.delivered[m] - plan.needTotal[m], 2)
    }
  })

  it('never buys more than the project total when it is told the total', () => {
    for (const item of project.items) {
      const s = scorePlan(planItem(project, item.code))
      expect(s.deliveredPlan).toBeLessThanOrEqual(s.deliveredReal + 1e-6)
    }
  })

  it('meets the same need as reality did: nothing is saved by serving the site less', () => {
    const reality = project.flows[POLE].use.reduce((a, b) => a + b, 0)
    expect(plan.needTotal.reduce((a, b) => a + b, 0)).toBeCloseTo(reality, 1)
  })
})

describe('the result on poles', () => {
  it('cuts idle stock sharply while meeting almost all need on time', () => {
    const s = scorePlan(planItem(project, POLE))
    expect(s.idleCut).toBeGreaterThan(0.35)
    expect(s.servedOnTime).toBeGreaterThan(0.95)
    expect(s.peakIdlePlan).toBeLessThan(s.peakIdleReal)
  })

  it('counts stock on hand in months of work, so items in different units can be compared', () => {
    const s = scorePlan(planItem(project, POLE))
    const months = project.flows[POLE].use
    const first = months.findIndex((x) => x > 0)
    const last = months.findLastIndex((x) => x > 0)
    const perMonth = months.reduce((a, b) => a + b, 0) / (last - first + 1)
    expect(s.monthsOnHandReal).toBeCloseTo(s.avgIdleReal / perMonth, 6)
    expect(s.monthsOnHandPlan).toBeLessThan(s.monthsOnHandReal)
  })

  it('never keeps the site waiting for any item on the default buffer', () => {
    for (const item of project.items) expect(scorePlan(planItem(project, item.code)).shortMonths, item.code).toBe(0)
  })

  it('trades idle stock for safety as the buffer grows', () => {
    const lean = scorePlan(planItem(project, POLE, { ...DEFAULT_SETTINGS, caution: 0.5 }))
    const careful = scorePlan(planItem(project, POLE, { ...DEFAULT_SETTINGS, caution: 3.5 }))
    expect(careful.avgIdlePlan).toBeGreaterThan(lean.avgIdlePlan)
    expect(careful.servedOnTime).toBeGreaterThanOrEqual(lean.servedOnTime)
  })
})
