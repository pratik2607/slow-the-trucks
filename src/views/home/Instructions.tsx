// Section 3: what the planner tells the stores this month. The filters stay on screen with their
// counts, and every line carries the same anatomy: what to do, to what, how much, and why.

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge, Chip } from '../../components/ui'
import type { ItemPlan } from '../../engine/planner'
import { remedyOf } from '../../engine/sets'
import { cover, monthLabel, qty, shortName, unitWord } from '../../lib/format'
import { godowns, months, project, setsCheck, type Replay, type Selection } from '../../model'
import { Card, itemName, place, reason, Section } from './shared'

type Verb = 'order' | 'hold' | 'move' | 'sets'

const SET_PLURAL: Record<string, string> = {
  MRP070060: 'Pole clamp sets',
  MRP070064: 'Single phase boxes',
  MRP070065: 'Three phase boxes',
}
const unitOf = (code: string) => unitWord(project.items.find((i) => i.code === code)!.unit)
const SHOWN = 6

function Row({ title, meta, amount, detail }: { title: string; meta?: string; amount: string; detail?: ReactNode }) {
  const head = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug">{title}</span>
        {meta && <span className="block text-[12.5px] text-muted">{meta}</span>}
      </span>
      <span className="figures narrow shrink-0 text-right text-[15px] font-bold">{amount}</span>
    </>
  )
  if (!detail) return <div className="flex items-center gap-4 border-t border-rule px-5 py-3 first:border-t-0">{head}</div>
  return (
    <details className="group border-t border-rule first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-3 hover:bg-cement/60 [&::-webkit-details-marker]:hidden">
        {head}
        <span aria-hidden className="w-12 shrink-0 text-right text-[12.5px] text-plan">
          <span className="group-open:hidden">Why</span>
          <span className="hidden group-open:inline">Close</span>
        </span>
      </summary>
      <div className="px-5 pb-4 text-[14px] leading-relaxed text-ink-2">{detail}</div>
    </details>
  )
}

export function Instructions({ sel, run, openSets }: { sel: Selection; run: Replay; openSets: () => void }) {
  const m = sel.month
  const [verb, setVerb] = useState<Verb>('order')
  const [all, setAll] = useState(false)

  const sheet = useMemo(() => {
    const order: ItemPlan[] = []
    const hold: ItemPlan[] = []
    let watching = 0
    const moves: { p: ItemPlan; from: number; to: number; qty: number; rescue: boolean }[] = []
    for (const item of project.items) {
      const p = run.plans[item.code]
      const dec = p.decisions[m]
      if (!dec.active) watching++
      else if (dec.ordered > 0) order.push(p)
      else hold.push(p)
      for (const mv of dec.moves) moves.push({ p, from: mv.from, to: mv.to, qty: mv.qty, rescue: !!mv.rescue })
    }
    // Items are counted in different units and there are no prices, so lines are ranked by how
    // many months of that item's own need they represent.
    const monthsOf = (p: ItemPlan, q: number) => (p.decisions[m].forecast > 0 ? q / p.decisions[m].forecast : 0)
    order.sort((a, b) => monthsOf(b, b.decisions[m].ordered) - monthsOf(a, a.decisions[m].ordered))
    hold.sort((a, b) => (b.decisions[m].coverMonths ?? 0) - (a.decisions[m].coverMonths ?? 0))
    moves.sort((a, b) => monthsOf(b.p, b.qty) - monthsOf(a.p, a.qty))

    // Sets: claim only what the records support. Order when the six godowns together are short
    // of a part; move when the part exists but sits in another godown.
    const sets = setsCheck.defs
      .map((def, si) => {
        const pooled = setsCheck.pooled[si][m]
        const flagged = godowns
          .map((_, g) => ({ g, kind: remedyOf(setsCheck, si, g, m), b: setsCheck.balance[si][g][m] }))
          .filter((x) => x.kind === 'move' || x.kind === 'order')
        const transfers = flagged
          .flatMap((x) => x.b.parts.filter((part) => part.status === 'short').map((part) => ({ g: x.g, child: part.child, qty: part.missing, cover: part.coverage ?? 0 })))
          .sort((a, b) => a.cover - b.cover)
        const missing = pooled.parts.filter((part) => part.status === 'short')
        return { def, flagged, transfers, missing, cannotFit: pooled.stranded, needsOrder: missing.length > 0 && pooled.stranded >= 1 }
      })
      .filter((s) => s.flagged.length > 0)
    return { order, hold, watching, moves, sets }
  }, [run, m])

  const counts: Record<Verb, number> = { order: sheet.order.length, hold: sheet.hold.length, move: sheet.moves.length, sets: sheet.sets.length }
  const meaning: Record<Verb, string> = {
    order: 'Stock on hand and on the way will not last until a new order lands.',
    hold: 'Already covered. Do not order.',
    move: 'One godown is running low and another has spare. Cheaper and faster than buying.',
    sets: 'Some items only work together. If one part is short, the rest waits.',
  }
  const total = counts[verb]
  const cut = <T,>(rows: T[]) => (all ? rows : rows.slice(0, SHOWN))

  return (
    <Section
      id="instructions"
      n={3}
      question="What does the planner tell the stores?"
      lead={`One sheet a month, for all 16 items. This is the sheet for ${monthLabel(months[m])}; move the month above and it changes.`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ['order', 'Order'],
            ['hold', 'Hold'],
            ['move', 'Move'],
            ['sets', 'Fix a set'],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            active={verb === id}
            count={counts[id]}
            onClick={() => {
              setVerb(id)
              setAll(false)
            }}
          >
            {label}
          </Chip>
        ))}
        {sheet.watching > 0 && <Badge>still watching {sheet.watching}</Badge>}
      </div>

      <Card>
        <p className="border-b border-rule px-5 py-3 text-[14px] text-ink-2">{meaning[verb]}</p>
        {total === 0 && <p className="px-5 py-4 text-[14px] text-muted">Nothing under this heading in {monthLabel(months[m])}.</p>}

        {verb === 'order' &&
          cut(sheet.order).map((p) => {
            const dec = p.decisions[m]
            const u = unitWord(p.item.unit)
            return (
              <Row
                key={p.item.code}
                title={shortName(p.item)}
                meta={`to land in ${m + p.leadMonths < months.length ? monthLabel(months[m + p.leadMonths]) : `${p.leadMonths} months`}`}
                amount={`${qty(dec.ordered)} ${u}`}
                detail={
                  <>
                    <p>{reason(p, m, u)}</p>
                    <p className="mt-1">
                      Send to {dec.orders.map((o) => `${place(o.godown)} ${qty(o.qty)}`).join(', ')}. Actually, {qty(p.realDelivered[m])} {u} arrived this month.
                    </p>
                  </>
                }
              />
            )
          })}

        {verb === 'hold' &&
          cut(sheet.hold).map((p) => {
            const dec = p.decisions[m]
            const u = unitWord(p.item.unit)
            return (
              <Row
                key={p.item.code}
                title={shortName(p.item)}
                meta={p.realDelivered[m] > 0 ? `actually, ${qty(p.realDelivered[m])} ${u} arrived this month` : undefined}
                amount={dec.coverMonths === null ? 'not in use' : `${cover(dec.coverMonths)} months in hand`}
                detail={<p>{reason(p, m, u)}</p>}
              />
            )
          })}

        {verb === 'move' &&
          cut(sheet.moves).map((mv, i) => (
            <Row
              key={i}
              title={shortName(mv.p.item)}
              meta={`${place(mv.from)} to ${place(mv.to)}${mv.rescue ? ', sent mid-month when the godown ran out' : ''}`}
              amount={`${qty(mv.qty)} ${unitWord(mv.p.item.unit)}`}
            />
          ))}

        {verb === 'sets' &&
          sheet.sets.map((s) => (
            <Row
              key={s.def.parent}
              title={SET_PLURAL[s.def.parent] ?? itemName(s.def.parent)}
              meta={s.needsOrder ? 'a part is missing across all six godowns' : 'the parts exist, in the wrong godown'}
              amount={s.needsOrder ? `${qty(Math.ceil(s.cannotFit))} cannot be fitted out` : 'move, do not buy'}
              detail={
                <>
                  {s.needsOrder ? (
                    <p>
                      The six godowns together are short of{' '}
                      {s.missing.map((part) => `${qty(part.missing)} ${unitOf(part.child)} of ${itemName(part.child).toLowerCase()}`).join(' and ')}. No
                      transfer can fix that. It has to be ordered.
                    </p>
                  ) : (
                    <p>The project holds enough of every part, but not where the parents are. Out of step in {s.flagged.map((x) => place(x.g)).join(', ')}.</p>
                  )}
                  {s.transfers.slice(0, 3).map((t, i) => (
                    <p key={i}>
                      {place(t.g)} needs {qty(t.qty)} {unitOf(t.child)} of {itemName(t.child).toLowerCase()}.
                    </p>
                  ))}
                  <button type="button" className="mt-1 font-semibold text-plan" onClick={openSets}>
                    Open the set check
                  </button>
                </>
              }
            />
          ))}

        {verb !== 'sets' && total > SHOWN && (
          <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-rule px-5 py-3 text-left text-[14px] font-semibold text-plan hover:bg-cement/60">
            {all ? 'Show fewer' : `Show all ${total}`}
          </button>
        )}
      </Card>
    </Section>
  )
}
