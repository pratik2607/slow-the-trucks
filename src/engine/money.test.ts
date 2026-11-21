import { describe, expect, it } from 'vitest'
import { project } from '../data'
import { ASSUMED_RATES, moneyView } from './money'
import { planItem, type ItemPlan } from './planner'

const plans: Record<string, ItemPlan> = Object.fromEntries(project.items.map((i) => [i.code, planItem(project, i.code)]))

describe('rupee figures', () => {
  it('has a rate for every item', () => {
    for (const item of project.items) expect(ASSUMED_RATES.perUnit[item.code]).toBeGreaterThan(0)
  })

  it('values idle stock as quantity times rate, item by item', () => {
    const pole = 'MPO010014'
    const only = moneyView({ [pole]: plans[pole] }, { perUnit: { [pole]: 1000 }, carryPerYear: 0.12 })
    plans[pole].realIdle.forEach((q, m) => expect(only.real[m]).toBeCloseTo(q * 1000, 3))
    plans[pole].idle.forEach((q, m) => expect(only.plan[m]).toBeCloseTo(q * 1000, 3))
  })

  it('charges one twelfth of the yearly holding cost for each month stock sits', () => {
    const view = moneyView(plans, ASSUMED_RATES)
    const stockMonths = view.real.reduce((a, b) => a + b, 0)
    expect(view.carryReal).toBeCloseTo((stockMonths * 0.12) / 12, 2)
  })

  it('scales with the rate card and nothing else', () => {
    const base = moneyView(plans, ASSUMED_RATES)
    const doubled = moneyView(plans, {
      perUnit: Object.fromEntries(Object.entries(ASSUMED_RATES.perUnit).map(([k, v]) => [k, v * 2])),
      carryPerYear: ASSUMED_RATES.carryPerYear,
    })
    expect(doubled.peakReal).toBeCloseTo(base.peakReal * 2, 0)
    expect(doubled.carryReal - doubled.carryPlan).toBeCloseTo((base.carryReal - base.carryPlan) * 2, 0)
  })

  it('shows the plan holding less money idle than reality did', () => {
    const view = moneyView(plans, ASSUMED_RATES)
    expect(view.avgPlan).toBeLessThan(view.avgReal)
    expect(view.peakPlan).toBeLessThan(view.peakReal)
    expect(view.unusedPlan).toBeLessThanOrEqual(view.unusedReal)
  })
})
