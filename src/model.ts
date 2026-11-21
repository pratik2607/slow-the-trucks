// Everything the screens read, worked out once when the page loads.

import { project } from './data'
import { itemLedger, summarise, type ItemLedger, type ItemSummary } from './engine/ledger'
import { planItem, scorePlan, type ItemPlan, type PlanScore, type PlanSettings } from './engine/planner'

export { project }

export const months = project.meta.months
export const godowns = project.meta.godowns

export const ledgers: Record<string, ItemLedger> = Object.fromEntries(
  project.items.map((item) => [item.code, itemLedger(project, item.code)]),
)

export const summaries: Record<string, ItemSummary> = Object.fromEntries(
  project.items.map((item) => [item.code, summarise(ledgers[item.code])]),
)

/** What the person is looking at. Shared by every view, so switching views keeps your place. */
export interface Selection {
  item: string
  /** Index into `godowns`, or -1 for all six together. */
  godown: number
  /** Index into `months`. */
  month: number
}

export type SetSelection = (patch: Partial<Selection>) => void

export const POLE = 'MPO010014'

/** The replay for all 16 items under one group of settings. */
export interface Replay {
  settings: PlanSettings
  plans: Record<string, ItemPlan>
  scores: Record<string, PlanScore>
}

export function replay(settings: PlanSettings): Replay {
  const plans: Record<string, ItemPlan> = {}
  const scores: Record<string, PlanScore> = {}
  for (const item of project.items) {
    plans[item.code] = planItem(project, item.code, settings)
    scores[item.code] = scorePlan(plans[item.code])
  }
  return { settings, plans, scores }
}
