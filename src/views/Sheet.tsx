// Monthly sheet: what the planner tells the stores for one month, across all 16 items.
// It depends on the month only, so the month is the only control on this screen.

import { monthLabel } from '../lib/format'
import { months, type Replay, type Selection, type SetSelection } from '../model'
import { bufferName } from './parts/BufferPicker'
import { Instructions } from './parts/Instructions'
import { PageHeader } from './parts/shared'

export function Sheet({ sel, set, run, openSets }: { sel: Selection; set: SetSelection; run: Replay; openSets: () => void }) {
  const m = sel.month
  const last = months.length - 1
  const step = (by: number) => set({ month: Math.min(last, Math.max(0, m + by)) })
  const arrow = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rule bg-panel text-[16px] hover:border-axis disabled:opacity-40'

  return (
    <div className="grid gap-6">
      <PageHeader title="Monthly sheet" job="Job 2: Plan it">
        One sheet a month for the stores: what to order, what to hold, what to move and which sets to fix. All 16 items, on the {bufferName(run.settings.caution).toLowerCase()} buffer.
      </PageHeader>

      <div className="sticky top-0 z-20 -mx-4 border-y border-rule bg-cement/90 px-4 py-2.5 shadow-bar backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Previous month" disabled={m === 0} onClick={() => step(-1)} className={arrow}>
            ‹
          </button>
          <span className="figures w-[5.2rem] shrink-0 text-center text-[15px] font-bold">{monthLabel(months[m])}</span>
          <button type="button" aria-label="Next month" disabled={m === last} onClick={() => step(1)} className={arrow}>
            ›
          </button>
          <input type="range" aria-label="Month" min={0} max={last} value={m} onChange={(e) => set({ month: Number(e.target.value) })} className="min-w-0 flex-1" />
        </div>
      </div>

      <Instructions sel={sel} run={run} openSets={openSets} />
    </div>
  )
}
