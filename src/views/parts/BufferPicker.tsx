// The one real choice in the plan: how big a buffer to keep. It sits at the top of the overview
// because every figure below depends on it, and each option shows its outcome before it is picked.

import { useMemo } from 'react'
import { Badge } from '../../components/ui'
import type { PlanSettings } from '../../engine/planner'
import { percent } from '../../lib/format'
import { project, replay, type Replay } from '../../model'

export const BUFFERS = [
  { caution: 1.5, name: 'Lean' },
  { caution: 2.25, name: 'Balanced' },
  { caution: 3, name: 'Careful' },
  { caution: 4, name: 'Safest' },
] as const

export const bufferName = (caution: number): string => BUFFERS.find((b) => b.caution === caution)?.name ?? 'Custom'

export function BufferPicker({ run, setSettings }: { run: Replay; setSettings: (patch: Partial<PlanSettings>) => void }) {
  const outcomes = useMemo(
    () =>
      BUFFERS.map((o) => {
        const r = o.caution === run.settings.caution ? run : replay({ ...run.settings, caution: o.caution })
        const cuts = project.items.map((i) => r.scores[i.code].idleCut).sort((a, b) => a - b)
        return {
          ...o,
          cut: (cuts[7] + cuts[8]) / 2,
          never: project.items.filter((i) => r.scores[i.code].shortMonths === 0).length,
        }
      }),
    [run],
  )
  const custom = !BUFFERS.some((o) => o.caution === run.settings.caution)

  return (
    <div className="rounded-2xl border border-rule bg-panel p-2 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-2 pt-1.5">
        <span className="text-[14px] font-bold">Buffer</span>
        <span className="text-[13px] text-ink-2">How much spare stock the plan keeps. A smaller buffer frees more stock but risks the site waiting.</span>
      </div>
      <div role="group" aria-label="Buffer" className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {outcomes.map((o) => {
          const chosen = o.caution === run.settings.caution
          return (
            <button
              key={o.name}
              type="button"
              aria-pressed={chosen}
              onClick={() => setSettings({ caution: o.caution })}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${
                chosen ? 'border-ink bg-ink text-panel' : 'border-transparent bg-cement hover:border-axis'
              }`}
            >
              <span>
                <span className="wide block text-[16px] font-bold leading-tight">{o.name}</span>
                <span className={`figures block text-[13px] ${chosen ? 'text-panel/80' : 'text-ink-2'}`}>{percent(o.cut)} less idle stock</span>
              </span>
              {o.never === project.items.length ? (
                <Badge tone="saved">never waits</Badge>
              ) : (
                <Badge tone={o.never >= 13 ? 'quiet' : 'wait'}>{project.items.length - o.never} items wait</Badge>
              )}
            </button>
          )
        })}
      </div>
      {custom && <p className="px-3 pt-2 text-[13px] text-ink-2">A custom buffer is in use, set under Plan settings.</p>}
    </div>
  )
}
