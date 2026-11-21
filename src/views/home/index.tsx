// The main page. It is built to be read cold, top to bottom, as five questions:
//   1. What does it save?            the answer, before anything else
//   2. Where does the material sit?  vendor, godown, contractor, site, in both worlds
//   3. What does the planner say?    the month's sheet
//   4. Which items gain most?        the evidence, item by item
//   5. How careful should it be?     the one real choice, with its cost shown up front
// One bar stays on screen with the two controls that drive all of it: the month and the item.

import { ItemSelect, PlayIcon, usePlayback } from '../../components/ui'
import type { PlanSettings } from '../../engine/planner'
import { monthLabel, qty } from '../../lib/format'
import { months, type Replay, type Selection, type SetSelection } from '../../model'
import { Caution } from './Caution'
import { Flow } from './Flow'
import { Instructions } from './Instructions'
import { Result } from './Result'
import { Scoreboard } from './Scoreboard'
import { ACTUAL, Dot, PLAN, Section } from './shared'

const WORKING = [
  ['see', 'Stock register', "Lumino's job 1, see it. Every item and godown, month by month: what came in, went out, was used and sat idle."],
  ['plan', 'Replay in detail', "Lumino's job 2, plan it. One item at a time, the reasoning for any month and the settings behind the plan."],
  ['sets', 'Set check', "Lumino's job 3, match the sets. Every godown and month where a set is out of step, and whether to move or order."],
] as const

export function Home({
  sel,
  set,
  run,
  setSettings,
  open,
}: {
  sel: Selection
  set: SetSelection
  run: Replay
  setSettings: (patch: Partial<PlanSettings>) => void
  open: (tab: 'see' | 'plan' | 'sets') => void
}) {
  const m = sel.month
  const play = usePlayback(m, (month) => set({ month }), true)
  const plan = run.plans[sel.item]
  const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="grid gap-12">
      <header className="pt-4">
        <p className="text-[13.5px] text-ink-2">Lumino's Kanpur power line project, replayed on its own records: 16 items, 6 godowns, 44 months</p>
        <h2 className="wide mt-3 max-w-[20ch] text-[34px] font-extrabold leading-[1.04] tracking-[-0.02em] sm:text-[50px]">
          Same site, same work. Far less stock lying idle.
        </h2>
        <p className="mt-4 max-w-[62ch] text-[16.5px] leading-relaxed text-ink-2">
          Lumino's trucks ran to a fixed timetable while the site worked at its own pace, so material piled up. This plan tells the stores each month what to
          order, hold and move, from what the site actually used.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              play.start()
              goTo('flow')
            }}
            className="inline-flex items-center gap-2.5 rounded-xl bg-ink px-5 py-3 text-[15px] font-semibold text-panel"
          >
            <PlayIcon playing={false} />
            Play the replay
          </button>
          <button type="button" onClick={() => goTo('items')} className="rounded-xl border border-rule bg-panel px-5 py-3 text-[15px] font-semibold hover:border-axis">
            See every item
          </button>
        </div>
      </header>

      <Section id="saves" n={1} question="What does it save?" lead="Our plan against what actually happened, over the whole project.">
        <Result run={run} />
      </Section>

      <div className="sticky top-0 z-20 -mx-4 -my-4 border-y border-rule bg-cement/90 px-4 py-2.5 shadow-bar backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex w-full min-w-0 items-center gap-3 lg:w-auto lg:flex-1">
            <button
              type="button"
              onClick={play.toggle}
              className="flex w-[6.5rem] shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2 text-[13.5px] font-semibold text-panel"
            >
              <PlayIcon playing={play.playing} />
              {play.playing ? 'Pause' : 'Play'}
            </button>
            <input
              type="range"
              aria-label="Month"
              min={0}
              max={months.length - 1}
              value={m}
              onChange={(e) => play.jump(Number(e.target.value))}
              className="min-w-0 flex-1"
            />
            <span className="figures w-[4.6rem] shrink-0 text-right text-[14px] font-bold">{monthLabel(months[m])}</span>
          </div>
          <ItemSelect value={sel.item} onChange={(item) => set({ item })} />
          <span className="figures narrow flex items-center gap-2 text-[14px]">
            <Dot color={ACTUAL} />
            <span className="font-bold">{qty(plan.realIdle[m])}</span>
            <span className="text-muted">lying unused, against</span>
            <Dot color={PLAN} />
            <span className="font-bold">{qty(plan.idle[m])}</span>
          </span>
        </div>
      </div>

      <Flow sel={sel} run={run} play={play} />
      <Instructions sel={sel} run={run} openSets={() => open('sets')} />
      <Scoreboard sel={sel} set={set} run={run} />
      <Caution run={run} setSettings={setSettings} />

      <section>
        <h2 className="wide text-[23px] font-bold leading-tight tracking-[-0.01em]">The working</h2>
        <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-ink-2">
          Lumino's brief asked for three jobs. Each has its own page, with every number behind this one.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {WORKING.map(([id, title, text]) => (
            <button key={id} type="button" onClick={() => open(id)} className="rounded-2xl border border-rule bg-panel p-5 text-left shadow-card hover:border-axis">
              <span className="wide block text-[17px] font-bold">{title}</span>
              <span className="mt-1.5 block text-[13.5px] leading-relaxed text-ink-2">{text}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
