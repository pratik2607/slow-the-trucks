// Ask AI (demo): a chat over the data. In this demo a question is matched to an item, a month, a
// godown and a kind of question, and answered from Lumino's records and the replay. A language
// model is planned behind the same screen. It has a cut-off month: it answers as if that month
// were today and cannot see anything after it.

import { useEffect, useRef, useState } from 'react'
import { ask, NOUNS, type Answer, type Screen } from '../ask'
import { monthLabel, shortName } from '../lib/format'
import { months, project, type Replay, type Selection, type SetSelection } from '../model'
import { Card, PageHeader } from './parts/shared'

export interface ChatLine {
  id: number
  question: string
  answer: Answer
  /** The cut-off month in force when the question was asked. */
  asOf: number
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
  setChat: (next: ChatLine[]) => void
  cutoff: number
  setCutoff: (month: number) => void
  open: (screen: Screen) => void
}) {
  const [draft, setDraft] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const last = months.length - 1
  const item = project.items.find((i) => i.code === sel.item)!
  const noun = NOUNS[sel.item] ?? shortName(item)
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1)
  const inView = Math.min(sel.month, cutoff)
  const when = monthLabel(months[inView])
  const until = monthLabel(months[cutoff])

  // Suggestions follow the item and month in view, so each one is a question that has an answer.
  const suggestions = [
    `${Noun} lying idle in ${when}?`,
    `What should we order for ${noun} in ${when}?`,
    `Worst month for ${noun}?`,
    'How much does the plan save overall?',
    'Which items are held longest?',
    `What does the sheet say for ${when}?`,
    `Which sets are out of balance in ${when}?`,
    'Does the site ever wait?',
  ]

  const send = (text: string) => {
    const question = text.trim()
    if (!question) return
    const answer = ask(question, { item: sel.item, month: sel.month, cutoff }, run)
    setChat([...chat, { id: chat.length + 1, question, answer, asOf: cutoff }])
    // Keep the item and month the answer was about in view, so "and in June?" works next.
    if (answer.about) set(answer.about)
    setDraft('')
  }

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [chat.length])

  return (
    <div className="grid gap-6">
      <PageHeader title="Ask AI" job="Demo">
        Ask about the data in plain words. This demo answers a set of common questions from Lumino's records and the replay.
      </PageHeader>

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="text-[14px] font-bold">Data cut-off</div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
            {cutoff === last
              ? 'It can see the whole project, to October 2026. Pull the cut-off back and it answers as if that month were today.'
              : `It answers as if the end of ${until} were today. Nothing after that exists for it; totals and averages stop there.`}
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
          {chat.length === 0 && <p className="self-center text-center text-[14px] text-muted">Pick a question below, or type your own. Name an item and a month.</p>}
          {chat.map((line) => (
            <div key={line.id} className="grid gap-2">
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14.5px] text-panel">{line.question}</div>
              <div className={`mr-auto max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-[14.5px] leading-relaxed ${line.answer.understood && !line.answer.beyond ? 'bg-cement' : 'bg-wait-soft'}`}>
                <p>{line.answer.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {line.answer.see && (
                    <button type="button" onClick={() => open(line.answer.see!.screen)} className="text-[13.5px] font-semibold text-plan">
                      {line.answer.see.label}
                    </button>
                  )}
                  <span className="text-[12px] text-muted">records up to {monthLabel(months[line.asOf])}</span>
                </div>
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>

        <form
          className="flex items-center gap-2 border-t border-rule p-3"
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Your question"
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
            <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-rule bg-panel px-3.5 py-1.5 text-left text-[13.5px] text-ink-2 hover:border-axis">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
