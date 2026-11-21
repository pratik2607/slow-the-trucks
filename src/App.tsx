import { useMemo, useState } from 'react'
import { DEFAULT_SETTINGS, type PlanSettings } from './engine/planner'
import { POLE, replay, summaries, type Selection } from './model'
import { PlanIt } from './views/PlanIt'
import { SeeIt } from './views/SeeIt'

// The numbers are the brief's own: Lumino asked for three jobs, in this order.
const TABS = [
  { id: 'see', label: '1  See it' },
  { id: 'plan', label: '2  Plan it' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('see')
  const [sel, setSel] = useState<Selection>({ item: POLE, godown: -1, month: summaries[POLE].peakIdleMonth })
  const [settings, setSettings] = useState<PlanSettings>(DEFAULT_SETTINGS)
  const set = (patch: Partial<Selection>) => setSel((current) => ({ ...current, ...patch }))
  const run = useMemo(() => replay(settings), [settings])

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-5 pt-6">
        <div>
          <h1 className="wide text-[26px] font-extrabold leading-none tracking-[-0.01em]">Slow the Trucks</h1>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-ink-2">
            Lumino's Kanpur power line project, replayed on 44 months of its own stock records.
          </p>
        </div>
        <nav aria-label="Views" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-[14px] whitespace-pre ${
                t.id === tab ? 'bg-ink font-semibold text-panel' : 'text-ink-2 hover:bg-panel'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'see' && <SeeIt sel={sel} set={set} />}
        {tab === 'plan' && (
          <PlanIt sel={sel} set={set} run={run} setSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))} />
        )}
      </main>

      <footer className="mt-10 max-w-[80ch] text-[12.5px] text-muted">
        Built at Vibe Coders Hackathon Edition 3 on data from Lumino Industries Limited. Quantities are exactly as
        recorded. Where something is an estimate or an assumption, the page says so next to it.
      </footer>
    </div>
  )
}
