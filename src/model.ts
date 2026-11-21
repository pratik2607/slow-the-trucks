// Everything the screens read, worked out once when the page loads.

import { project } from './data'
import { itemLedger, summarise, type ItemLedger, type ItemSummary } from './engine/ledger'

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
