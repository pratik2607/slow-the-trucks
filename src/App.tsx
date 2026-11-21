import { useMemo, useState } from 'react'
import { ASSUMED_RATES, moneyView, type RateCard } from './engine/money'
import { DEFAULT_SETTINGS, type PlanSettings } from './engine/planner'
import { POLE, replay, summaries, type Selection } from './model'
import { PlanIt } from './views/PlanIt'
import { ThePlan } from './views/ThePlan'
import { SeeIt } from './views/SeeIt'
import { Sets } from './views/Sets'

// One page tells the whole story. The other three are its working, numbered as Lumino's brief
// numbers its three jobs: see it, plan it, match the sets.
const WORKING = [
  { id: 'see', label: '1  Stock register' },
  { id: 'plan', label: '2  Replay in detail' },
  { id: 'sets', label: '3  Set check' },
] as const
type TabId = 'home' | (typeof WORKING)[number]['id']

const fromHash = (): TabId => {
  const h = window.location.hash.replace('#', '')
  return h === 'see' || h === 'plan' || h === 'sets' ? h : 'home'
}

const RATES_KEY = 'slow-the-trucks.rates.v1'

/** Rates someone typed in earlier on this device, if any. Falls back to the assumed card. */
function storedRates(): RateCard {
  try {
    const raw = window.localStorage.getItem(RATES_KEY)
    if (!raw) return ASSUMED_RATES
    const saved = JSON.parse(raw) as Partial<RateCard>
    return {
      perUnit: { ...ASSUMED_RATES.perUnit, ...(saved.perUnit ?? {}) },
      carryPerYear: typeof saved.carryPerYear === 'number' ? saved.carryPerYear : ASSUMED_RATES.carryPerYear,
    }
  } catch {
    return ASSUMED_RATES
  }
}

export default function App() {
  const [tab, setTabState] = useState<TabId>(fromHash)
  const setTab = (next: TabId) => {
    setTabState(next)
    window.history.replaceState(null, '', next === 'home' ? window.location.pathname : `#${next}`)
    window.scrollTo({ top: 0 })
  }
  const [sel, setSel] = useState<Selection>({ item: POLE, godown: -1, month: summaries[POLE].peakIdleMonth })
  const [settings, setSettings] = useState<PlanSettings>(DEFAULT_SETTINGS)
  const set = (patch: Partial<Selection>) => setSel((current) => ({ ...current, ...patch }))
  const run = useMemo(() => replay(settings), [settings])
  const [rates, setRatesState] = useState<RateCard>(storedRates)
  const setRates = (next: RateCard) => {
    setRatesState(next)
    try {
      window.localStorage.setItem(RATES_KEY, JSON.stringify(next))
    } catch {
      // Private window or blocked storage: the rates still apply for this visit.
    }
  }
  const money = useMemo(() => moneyView(run.plans, rates), [run, rates])

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-5 pt-6">
        <div>
          <h1 className="wide text-[26px] font-extrabold leading-none tracking-[-0.01em]">Slow the Trucks</h1>
          <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-ink-2">
            Tells Lumino's stores what to order, hold and move each month, from what the site actually used.
          </p>
        </div>
        <nav aria-label="Views" className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
          <button
            type="button"
            aria-current={tab === 'home' ? 'page' : undefined}
            onClick={() => setTab('home')}
            className={`rounded-md px-3 py-1.5 text-[14px] ${tab === 'home' ? 'bg-ink font-semibold text-panel' : 'text-ink-2 hover:bg-panel'}`}
          >
            The plan
          </button>
          <span className="ml-3 mr-1 text-[12.5px] text-muted">The working</span>
          {WORKING.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={t.id === tab ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-2.5 py-1.5 text-[13.5px] whitespace-pre ${
                t.id === tab ? 'bg-ink font-semibold text-panel' : 'text-ink-2 hover:bg-panel'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'home' && <ThePlan sel={sel} set={set} run={run} money={money} rates={rates} open={setTab} />}
        {tab === 'see' && <SeeIt sel={sel} set={set} />}
        {tab === 'plan' && (
          <PlanIt
            sel={sel}
            set={set}
            run={run}
            setSettings={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            money={money}
            rates={rates}
            setRates={setRates}
          />
        )}
        {tab === 'sets' && <Sets sel={sel} set={set} />}
      </main>

      <footer className="mt-10 max-w-[80ch] text-[12.5px] text-muted">
        Built at Vibe Coders Hackathon Edition 3 on data from Lumino Industries Limited. Quantities are exactly as
        recorded. Where something is an estimate or an assumption, the page says so next to it.
      </footer>
    </div>
  )
}
