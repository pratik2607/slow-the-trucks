// Overview: the whole project, all 16 items. The buffer comes first because every figure below
// depends on it; then the overall result; then each item, actual against our plan.

import type { PlanSettings } from '../engine/planner'
import { type Replay, type Selection } from '../model'
import { BufferPicker } from './parts/BufferPicker'
import { Result } from './parts/Result'
import { Scoreboard } from './parts/Scoreboard'
import { Block, PageHeader } from './parts/shared'

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
      </Block>
      <Scoreboard sel={sel} run={run} openItem={openItem} />
    </div>
  )
}
