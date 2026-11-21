// Overview: the whole project, all 16 items. The buffer comes first because every figure below
// depends on it; then the overall result with what makes it trustworthy beside it; then each
// item, actual against our plan.

import type { PlanSettings } from '../engine/planner'
import { type Replay, type Selection } from '../model'
import { BufferPicker } from './parts/BufferPicker'
import { Result } from './parts/Result'
import { Scoreboard } from './parts/Scoreboard'
import { Block, Card, PageHeader } from './parts/shared'

const PROOF = [
  ['It sees only the past', "Each month's decision uses earlier months alone. A test wipes everything after a month and checks that no decision before it changes."],
  ['The same work gets done', 'In both worlds the site uses exactly what it really used, in the same months. Nothing is saved by serving the site less.'],
  ['Nothing is priced', "Lumino's records carry no prices, so every figure is a quantity taken straight from those records."],
] as const

export function Overview({
  sel,
  run,
  setSettings,
  openItem,
}: {
  sel: Selection
  run: Replay
  setSettings: (patch: Partial<PlanSettings>) => void
  openItem: (code: string) => void
}) {
  return (
    <div className="grid gap-7">
      <PageHeader title="Overview" job="Job 2: Plan it">
        Our plan against what actually happened. All 16 items, six godowns, the whole project from March 2023 to October 2026.
      </PageHeader>

      <BufferPicker run={run} setSettings={setSettings} />

      <Block title="Overall result">
        <Result run={run} />
        <Card className="mt-4 grid gap-x-8 gap-y-4 p-5 md:grid-cols-3">
          {PROOF.map(([title, text]) => (
            <div key={title} className="flex gap-3">
              <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-saved-soft text-saved">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6.5 5 9l4.5-6" />
                </svg>
              </span>
              <div>
                <div className="text-[14px] font-bold">{title}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{text}</p>
              </div>
            </div>
          ))}
        </Card>
      </Block>

      <Scoreboard sel={sel} run={run} openItem={openItem} />
    </div>
  )
}
