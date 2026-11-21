import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_SETTINGS, type PlanSettings } from './engine/planner'
import { months, POLE, replay, summaries, type Selection } from './model'
import { Ask, type ChatLine } from './views/Ask'
import { ItemReplay } from './views/ItemReplay'
import { Overview } from './views/Overview'
import { PlanSettingsView } from './views/PlanSettings'
import { SeeIt } from './views/SeeIt'
import { Sets } from './views/Sets'
import { Sheet } from './views/Sheet'

// The screens, grouped the way the work is done: the plan and its result first, then the
// records it is built on, then the settings behind it.
const NAV = [
  {
    group: 'Plan',
    items: [
      { id: 'overview', label: 'Overview', icon: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z' },
      { id: 'sheet', label: 'Monthly sheet', icon: 'M4 5h12M4 10h12M4 15h8' },
      { id: 'item', label: 'Item replay', icon: 'M6 4v12l10-6z' },
    ],
  },
  {
    group: 'Ask',
    items: [{ id: 'ask', label: 'Ask AI', tag: 'Gemini', icon: 'M4 4.5h12v8.5H9.5L6 16v-3H4z' }],
  },
  {
    group: 'Records',
    items: [
      { id: 'register', label: 'Stock register', icon: 'M5 3h9a2 2 0 0 1 2 2v12H6.5A1.5 1.5 0 0 1 5 15.5zM5 15.5A1.5 1.5 0 0 1 6.5 14H16' },
      { id: 'sets', label: 'Set check', icon: 'M8 12l4-4M7.5 9.5l-2 2a2.8 2.8 0 0 0 4 4l2-2M12.5 10.5l2-2a2.8 2.8 0 0 0-4-4l-2 2' },
    ],
  },
  {
    group: 'Setup',
    items: [{ id: 'settings', label: 'Plan settings', icon: 'M4 6h12M4 14h12M8 4v4M12 12v4' }],
  },
] as const

type ScreenId = (typeof NAV)[number]['items'][number]['id']
const SCREENS = NAV.flatMap((g) => g.items.map((i) => i.id)) as ScreenId[]

const fromHash = (): ScreenId => {
  const h = window.location.hash.replace('#', '') as ScreenId
  return SCREENS.includes(h) ? h : 'overview'
}

export default function App() {
  const [screen, setScreenState] = useState<ScreenId>(fromHash)
  useEffect(() => {
    const follow = () => setScreenState(fromHash())
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  const go = (next: ScreenId) => {
    setScreenState(next)
    window.history.replaceState(null, '', next === 'overview' ? window.location.pathname : `#${next}`)
    window.scrollTo({ top: 0 })
  }

  const [sel, setSel] = useState<Selection>({ item: POLE, godown: -1, month: summaries[POLE].peakIdleMonth })
  const [settings, setSettingsState] = useState<PlanSettings>(DEFAULT_SETTINGS)
  const set = (patch: Partial<Selection>) => setSel((current) => ({ ...current, ...patch }))
  const setSettings = (patch: Partial<PlanSettings>) => setSettingsState((s) => ({ ...s, ...patch }))
  const run = useMemo(() => replay(settings), [settings])
  // The conversation lives here so it is still there after a visit to another screen.
  const [chat, setChat] = useState<ChatLine[]>([])
  // The last month the chat is allowed to know about. It starts by seeing the whole project.
  const [cutoff, setCutoff] = useState(months.length - 1)

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-rule bg-panel lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-3.5 lg:px-5 lg:pb-5 lg:pt-6">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-real">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 7H13v9.5H2.5zM13 10h4.2l3.3 3.3v3.2H13" />
            </svg>
          </span>
          <div>
            <h1 className="wide text-[16px] font-extrabold leading-none tracking-[-0.01em]">Slow the Trucks</h1>
            <p className="mt-1 text-[12px] leading-none text-muted">Lumino, Kanpur project</p>
          </div>
        </div>

        <nav aria-label="Screens" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:overflow-visible lg:pb-0">
          {NAV.map((group) => (
            <div key={group.group} className="flex shrink-0 gap-1 lg:mb-4 lg:block">
              <div className="hidden px-2 pb-1.5 text-[12px] text-muted lg:block">{group.group}</div>
              {group.items.map((item) => {
                const active = item.id === screen
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => go(item.id)}
                    className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[14px] whitespace-nowrap lg:w-full ${
                      active ? 'bg-ink font-semibold text-panel' : 'text-ink-2 hover:bg-cement'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d={item.icon} />
                    </svg>
                    {item.label}
                    {'tag' in item && (
                      <span className={`ml-auto rounded-full px-2 py-px text-[11.5px] font-normal ${active ? 'bg-panel/20 text-panel' : 'bg-cement text-ink-2'}`}>{item.tag}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        <p className="mt-auto hidden px-5 pb-5 text-[12px] leading-relaxed text-muted lg:block">
          16 items, 6 godowns, March 2023 to October 2026. Built at Vibe Coders Hackathon Edition 3 on Lumino's own records. Quantities are exactly as recorded.
        </p>
      </aside>

      <main className="min-w-0 px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="mx-auto max-w-[1120px]">
          {screen === 'overview' && (
            <Overview
              sel={sel}
              run={run}
              setSettings={setSettings}
              openItem={(item) => {
                set({ item })
                go('item')
              }}
            />
          )}
          {screen === 'sheet' && <Sheet sel={sel} set={set} run={run} openSets={() => go('sets')} />}
          {screen === 'item' && <ItemReplay sel={sel} set={set} run={run} />}
          {screen === 'ask' && <Ask sel={sel} set={set} run={run} chat={chat} setChat={setChat} cutoff={cutoff} setCutoff={setCutoff} open={go} />}
          {screen === 'register' && <SeeIt sel={sel} set={set} />}
          {screen === 'sets' && <Sets sel={sel} set={set} />}
          {screen === 'settings' && <PlanSettingsView run={run} setSettings={setSettings} />}
        </div>
      </main>
    </div>
  )
}
