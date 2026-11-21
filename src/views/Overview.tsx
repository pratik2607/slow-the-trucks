// Overview: the whole project, all 16 items. The buffer comes first because every figure below
// depends on it; then the overall result with what makes it trustworthy beside it; then each
// item, actual against our plan.

import { useState } from 'react'
import { Tour, type TourStep } from '../components/Tour'
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

// The tour names what each figure means. It quotes no figure itself, because they change with the buffer.
const TOUR: readonly TourStep[] = [
  { target: '[data-tour="buffer"]', title: 'Start with the buffer', body: 'How much spare stock the plan keeps. Every figure on this page follows this choice, and each option shows what it saves and what it risks.' },
  { target: '[data-tour="tiles"] > :nth-child(1)', title: 'Stock lying idle', body: 'The headline. Stock sitting in godowns or with contractors, not yet used: how much less of it the plan holds than actually lay there. Orange is actual, blue is our plan.' },
  { target: '[data-tour="tiles"] > :nth-child(2)', title: 'Stock kept on hand', body: "The same pile counted in months of the site's own work. Fewer months means less material waiting around." },
  { target: '[data-tour="tiles"] > :nth-child(3)', title: 'Biggest pile', body: 'The most that ever lay unused at one time, plan against actual.' },
  { target: '[data-tour="tiles"] > :nth-child(4)', title: 'Site kept waiting', body: 'The check on the saving. One bar for each of the 16 items; green means the site never waited for it.' },
  { target: '[data-tour="proof"]', title: 'Why the figures hold', body: "Each month's decision sees earlier months only, the site uses exactly what it really used, and everything is counted in quantities." },
  { target: '[data-tour="items"]', title: 'Every item, one row each', body: 'Actual against our plan for all 16 items. Open a row to replay that item month by month.' },
]

const SEEN = 'slow-the-trucks:tour-seen'
/** True the first time this browser opens the app, so the tour introduces itself once. */
const firstVisit = (): boolean => {
  try {
    return window.localStorage.getItem(SEEN) === null
  } catch {
    return false
  }
}

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
  const [tour, setTour] = useState(firstVisit)
  const closeTour = () => {
    try {
      window.localStorage.setItem(SEEN, '1')
    } catch {
      // private browsing: the tour simply shows again next time
    }
    setTour(false)
  }
  return (
    <div className="grid gap-7">
      <PageHeader title="Overview" job="Job 2: Plan it">
        Our plan against what actually happened. All 16 items, six godowns, the whole project from March 2023 to October 2026.{' '}
        <button type="button" onClick={() => setTour(true)} className="font-semibold text-plan">
          Take the 30-second tour
        </button>
      </PageHeader>
      {tour && <Tour steps={TOUR} onClose={closeTour} />}

      <div data-tour="buffer">
        <BufferPicker run={run} setSettings={setSettings} />
      </div>

      <Block title="Overall result">
        <Result run={run} />
        <div data-tour="proof" className="mt-4">
          <Card className="grid gap-x-8 gap-y-4 p-5 md:grid-cols-3">
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
        </div>
      </Block>

      <div data-tour="items">
        <Scoreboard sel={sel} run={run} openItem={openItem} />
      </div>
    </div>
  )
}
