// Ask AI: a chat over the data. A question goes, with the records and the replay up to the cut-off
// month, to a language model (through relay/server.js: OpenAI first, Gemini on Vertex AI standing
// by), which answers from them. The app's own calculation runs first: it enforces the cut-off, hands the model checked
// figures to build on, and is the answer shown if the model cannot be reached.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ask, NOUNS, type Answer, type Screen } from '../ask'
import { monthLabel, shortName } from '../lib/format'
import { askModel } from '../llm'
import { months, project, type Replay, type Selection, type SetSelection } from '../model'
import { Rich } from './parts/Rich'
import { Card, PageHeader } from './parts/shared'

export interface ChatLine {
  id: number
  question: string
  answer: Answer
  /** The cut-off month in force when the question was asked. */
  asOf: number
  /** True while the model is being asked. */
  pending?: boolean
  /** Who wrote the answer shown: the language model, or the app's own calculation. */
  by: 'model' | 'app'
  /** The model that answered, as the relay names it. */
  model?: string
}

export function Ask({
  sel,
  set,
  run,
  chat,
  setChat,
  cutoff,
  setCutoff,
  open,
}: {
  sel: Selection
  set: SetSelection
  run: Replay
  chat: ChatLine[]
  setChat: Dispatch<SetStateAction<ChatLine[]>>
  cutoff: number
  setCutoff: (month: number) => void
  open: (screen: Screen) => void
}) {
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const nextId = useRef(chat.length + 1)
  const last = months.length - 1
  const item = project.items.find((i) => i.code === sel.item)!
  const noun = NOUNS[sel.item] ?? shortName(item)
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1)
  const inView = Math.min(sel.month, cutoff)
  const when = monthLabel(months[inView])
  const until = monthLabel(months[cutoff])

  // Suggestions follow the item and month in view.
  const suggestions = [
    `${Noun} lying idle in ${when}?`,
    `What should we order for ${noun} in ${when}?`,
    `Why did so many ${noun} pile up?`,
    'How much does the plan save overall?',
    'Which three items gain the most from the plan?',
    `What does the sheet say for ${when}?`,
    `Which sets are out of balance in ${when}?`,
    'Does the site ever wait?',
  ]

  const send = async (text: string) => {
    const question = text.trim()
    if (!question) return
    const asked = cutoff
    const local = ask(question, { item: sel.item, month: sel.month, cutoff: asked }, run)
    const id = nextId.current++
    // Earlier turns asked under a later cut-off are left out, so they cannot carry later months back in.
    const history = chat
      .filter((l) => !l.pending && l.asOf <= asked && !l.answer.beyond)
      .slice(-3)
      .map((l) => ({ q: l.question, a: l.answer.text }))
    setChat((c) => [...c, { id, question, answer: local, asOf: asked, pending: !local.beyond, by: 'app' }])
    // Keep the item and month the answer was about in view, so "and in June?" works next.
    if (local.about) set(local.about)
    setDraft('')
    // A question about a month after the cut-off is declined here, before any model is asked.
    if (local.beyond) return
    try {
      const reply = await askModel(question, run, asked, local.understood ? local.text : null, history)
      setChat((c) => c.map((l) => (l.id === id ? { ...l, pending: false, by: 'model', model: reply.model, answer: { ...local, understood: true, text: reply.text } } : l)))
    } catch {
      setChat((c) => c.map((l) => (l.id === id ? { ...l, pending: false } : l)))
    }
  }

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [chat])

  return (
    <div className="grid gap-6">
      <PageHeader title="Ask AI" job="Language model">
        Ask about the data in plain words. A language model reads Lumino's records and the replay, up to the cut-off month, and answers from them.
      </PageHeader>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="text-[14px] font-bold">Data cut-off</div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
            {cutoff === last
              ? 'It is sent the whole project, to October 2026. Pull the cut-off back and only the records up to that month are sent.'
              : `Only the records up to the end of ${until} are sent to it. Nothing after that exists for it; totals and averages stop there.`}
          </p>
        </div>
        <label className="flex min-w-0 flex-1 basis-80 items-center gap-3 text-[13px] text-ink-2">
          <span className="shrink-0">Records up to</span>
          <input type="range" aria-label="Data cut-off month" min={0} max={last} value={cutoff} onChange={(e) => setCutoff(Number(e.target.value))} className="min-w-0 flex-1" />
          <span className="figures w-[4.6rem] shrink-0 text-right text-[14px] font-bold text-ink">{until}</span>
        </label>
      </Card>

      <Card className="flex flex-col">
        <div className="grid max-h-[50vh] min-h-[11rem] gap-4 overflow-y-auto p-5" aria-live="polite">
          {chat.length === 0 && <p className="self-center text-center text-[14px] text-muted">Pick a question below, or type your own.</p>}
          {chat.map((line) => (
            <div key={line.id} className="grid gap-2">
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] text-panel">{line.question}</div>
              {line.pending ? (
                <div className="mr-auto rounded-2xl rounded-bl-md bg-cement px-4 py-3 text-[14.5px] text-muted">
                  <span className="animate-pulse">Reading the records…</span>
                </div>
              ) : (
                <div className={`mr-auto max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-[14.5px] leading-relaxed ${line.answer.understood && !line.answer.beyond ? 'bg-cement' : 'bg-wait-soft'}`}>
                  <Rich text={line.answer.text} />
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {line.answer.see && (
                      <button type="button" onClick={() => open(line.answer.see!.screen)} className="text-[13.5px] font-semibold text-plan">
                        {line.answer.see.label}
                      </button>
                    )}
                    <span className="text-[12px] text-muted">
                      {line.by === 'model'
                        ? `${line.model ?? 'Language model'}, from records up to ${monthLabel(months[line.asOf])}`
                        : line.answer.beyond
                          ? `records up to ${monthLabel(months[line.asOf])}`
                          : `worked out by the app, records up to ${monthLabel(months[line.asOf])}: the model could not be reached`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={end} />
        </div>

        <form
          className="flex items-center gap-2 border-t border-rule p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send(draft)
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Your question"
            maxLength={400}
            placeholder={`${Noun} lying idle in ${when}?`}
            className="min-w-0 flex-1 rounded-xl border border-rule bg-panel px-4 py-2.5 text-[15px] placeholder:text-muted"
          />
          <button type="submit" disabled={!draft.trim()} className="shrink-0 rounded-xl bg-ink px-5 py-2.5 text-[14.5px] font-semibold text-panel disabled:opacity-40">
            Ask
          </button>
        </form>
      </Card>

      <div>
        <div className="mb-2 text-[13px] text-ink-2">
          Try one. They follow the item and month in view: {shortName(item)}, {when}.
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-rule bg-panel px-3.5 py-1.5 text-left text-[13.5px] text-ink-2 hover:border-axis">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
