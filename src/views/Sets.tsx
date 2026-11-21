// Job 3, "Match the sets": every month and godown where a set is out of balance, why, and
// whether a transfer or an order puts it right.

import { useMemo, useState } from 'react'
import { Legend, plotLeft, TimeChart, useWidth, type Series } from '../components/chart'
import { MonthPicker, Panel, Segmented } from '../components/ui'
import { checkSets, ratioKey, SHORT_BELOW, SURPLUS_ABOVE, type Lens, type RatioBasis, type SetsCheck } from '../engine/sets'
import { godownShort, monthLabel, qty, shortName, unitWord } from '../lib/format'
import { godowns, months, project, type Selection, type SetSelection } from '../model'

const itemOf = (code: string) => project.items.find((i) => i.code === code)!
const nameOf = (code: string) => shortName(itemOf(code))
const unitOf = (code: string) => unitWord(itemOf(code).unit)

const PLURAL: Record<string, string> = {
  MRP070060: 'pole clamp sets',
  MRP070064: 'single phase boxes',
  MRP070065: 'three phase boxes',
}
/** A small ratio keeps its significant digits: 0.0000862 tonnes, not 0. */
const ratioText = (x: number) => (x >= 0.01 ? qty(x) : String(Number(x.toPrecision(3))))

type Kind = 'empty' | 'ok' | 'move' | 'order' | 'surplus'

const KINDS: Record<Kind, { label: string; color: string }> = {
  ok: { label: 'In balance', color: '#b3bcc3' },
  move: { label: 'Short here, but another godown has the part', color: 'var(--color-warning)' },
  order: { label: 'Short across the whole project', color: 'var(--color-critical)' },
  surplus: { label: 'Parts ahead of their parents', color: '#6250d6' },
  empty: { label: 'Nothing sent yet', color: 'var(--color-rule)' },
}

/** A short godown is a transfer problem if the project as a whole has the part, an order problem if not. */
function kindOf(check: SetsCheck, si: number, g: number, m: number): Kind {
  const b = check.balance[si][g][m]
  if (b.status !== 'short') return b.status
  const shortHere = b.parts.filter((p) => p.status === 'short').map((p) => p.child)
  const shortEverywhere = check.pooled[si][m].parts.some((p) => shortHere.includes(p.child) && p.status === 'short')
  return shortEverywhere ? 'order' : 'move'
}

function StatusRows({
  kinds,
  selectedRow,
  cursor,
  onPick,
  describe,
  padLeft,
}: {
  kinds: Kind[][]
  selectedRow: number
  cursor: number
  onPick: (row: number, month: number) => void
  describe: (row: number, month: number) => string
  padLeft: number
}) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<{ row: number; month: number } | null>(null)
  const n = months.length
  const left = plotLeft(width, padLeft)
  const step = Math.max(1, width - left - 10) / n
  const rowH = 24
  const flip = hover !== null && left + hover.month * step > width * 0.55

  return (
    <div ref={ref} className="relative select-none">
      <svg width={width} height={kinds.length * rowH + 20} role="img" aria-label="Set balance by godown and month" className="block">
        {kinds.map((row, ri) => (
          <g key={ri}>
            <text
              x={left - 6}
              y={ri * rowH + rowH / 2 + 3}
              textAnchor="end"
              fontSize={11.5}
              fontWeight={ri === selectedRow ? 700 : 400}
              fill={ri === selectedRow ? 'var(--color-ink)' : 'var(--color-ink-2)'}
            >
              {left < 60 ? godownShort(godowns[ri].name).slice(0, 3) : godownShort(godowns[ri].name)}
            </text>
            {row.map((kind, m) => (
              <rect
                key={m}
                x={left + m * step + 0.75}
                y={ri * rowH + 1}
                width={Math.max(1, step - 1.5)}
                height={rowH - 3}
                rx={1.5}
                fill={KINDS[kind].color}
                fillOpacity={kind === 'empty' ? 0.55 : 1}
                stroke={ri === selectedRow && m === cursor ? 'var(--color-ink)' : 'none'}
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHover({ row: ri, month: m })}
                onPointerLeave={() => setHover(null)}
                onClick={() => onPick(ri, m)}
              />
            ))}
          </g>
        ))}
        {months.map((ym, m) =>
          m === 0 || ym.endsWith('-01') ? (
            <text key={ym} x={left + m * step + 3} y={kinds.length * rowH + 14} fontSize={11} fill="var(--color-muted)" className="figures">
              {ym.slice(0, 4)}
            </text>
          ) : null,
        )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-72 rounded-md border border-rule bg-panel px-2.5 py-1.5 text-[12.5px] shadow-[0_6px_18px_-8px_rgba(23,32,43,0.35)]"
          style={{
            top: hover.row * rowH + rowH + 4,
            left: flip ? undefined : left + hover.month * step + 8,
            right: flip ? width - (left + hover.month * step) + 8 : undefined,
          }}
        >
          <div className="font-semibold">
            {godownShort(godowns[hover.row].name)}, {monthLabel(months[hover.month])}
          </div>
          <div>{describe(hover.row, hover.month)}</div>
        </div>
      )}
    </div>
  )
}

export function Sets({ sel, set }: { sel: Selection; set: SetSelection }) {
  const [si, setSi] = useState(0)
  const [basis, setBasis] = useState<RatioBasis>('usage')
  const [lens, setLens] = useState<Lens>('supplied')
  const [overrides, setOverrides] = useState<Record<string, number>>({})

  const check = useMemo(() => checkSets(project, basis, overrides, lens), [basis, overrides, lens])
  const def = check.defs[si]
  const parentName = nameOf(def.parent)
  const parentUnit = unitOf(def.parent)
  const parents = PLURAL[def.parent] ?? parentName
  const g = sel.godown >= 0 ? sel.godown : 0
  const m = sel.month
  const here = check.balance[si][g][m]
  const everywhere = check.pooled[si][m]
  const kind = kindOf(check, si, g, m)
  const counted = lens === 'supplied' ? 'sent here so far' : 'on the shelf'

  const kinds = useMemo(
    () => godowns.map((_, gi) => months.map((_, mi) => kindOf(check, si, gi, mi))),
    [check, si],
  )
  const tally = useMemo(() => {
    const t: Record<Kind, number> = { empty: 0, ok: 0, move: 0, order: 0, surplus: 0 }
    for (const row of kinds) for (const k of row) t[k]++
    return t
  }, [kinds])
  const live = months.length * godowns.length - tally.empty

  const bands: Series[] = useMemo(() => {
    const order = check.stranded[si].map((s, mi) => Math.min(s, check.pooled[si][mi].stranded))
    const move = check.stranded[si].map((s, mi) => Math.max(0, s - order[mi]))
    return [
      { key: 'fit', label: 'Could be fitted out where they are', color: '#8b959d', values: check.complete[si] },
      { key: 'move', label: 'Waiting: the part is in another godown', color: 'var(--color-warning)', values: move },
      { key: 'order', label: 'Waiting: the part is missing everywhere', color: 'var(--color-critical)', values: order },
    ]
  }, [check, si])

  const limitingName = here.limiting ? nameOf(here.limiting) : ''

  return (
    <div className="grid gap-4">
      <p className="max-w-[80ch] text-[15px]">
        A pole clamp is no use without its eye hook and its bolts. If one part runs short, the whole set waits, however
        much of the rest is lying in the store. For each of Lumino's three sets this checks every godown and every month:
        of the parents sent there, how many could actually be fitted out with the parts sent alongside?
      </p>

      <Panel
        title="First, which ratio?"
        note="Lumino's sheet gives a ratio for each part. For most parts it does not match what the site used, and Lumino's own note says to ask its team before relying on it. Until someone does, the check uses what the site actually used. Type a number to use your own."
        aside={
          <Segmented
            label="Which ratio to hold the sets to"
            value={basis}
            onChange={(next) => {
              setBasis(next)
              setOverrides({})
            }}
            options={[
              { value: 'usage', label: 'What the site used' },
              { value: 'lumino', label: "Lumino's ratio as given" },
            ]}
          />
        }
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13.5px] whitespace-nowrap">
            <thead>
              <tr className="text-right text-[12.5px] text-ink-2">
                <th className="py-1.5 pl-4 pr-3 text-left font-medium">Set</th>
                <th className="px-3 py-1.5 text-left font-medium">Part it needs</th>
                <th className="px-3 py-1.5 font-medium">Lumino's ratio</th>
                <th className="px-3 py-1.5 font-medium">Site used, per parent</th>
                <th className="px-3 py-1.5 text-left font-medium">Do they agree?</th>
                <th className="py-1.5 pl-3 pr-4 font-medium">Ratio in force</th>
              </tr>
            </thead>
            <tbody>
              {check.defs.map((d) =>
                d.parts.map((p, pi) => {
                  const agree = p.observed !== null && Math.abs(p.observed - p.lumino) / p.lumino < 0.2
                  const k = ratioKey(d.parent, p.child)
                  return (
                    <tr key={k} className="border-t border-rule">
                      <td className="py-1.5 pl-4 pr-3 font-medium">{pi === 0 ? nameOf(d.parent) : ''}</td>
                      <td className="px-3 py-1.5">
                        {nameOf(p.child)}
                        {p.shared && <span className="ml-2 text-[12px] text-muted">shared by all three sets</span>}
                      </td>
                      <td className="figures narrow px-3 py-1.5 text-right">{p.lumino}</td>
                      <td className="figures narrow px-3 py-1.5 text-right">
                        {p.observed === null ? '–' : `${ratioText(p.observed)} ${unitOf(p.child)}`}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-full"
                            style={{ background: agree ? 'var(--color-good)' : 'var(--color-warning)' }}
                          />
                          {agree ? 'Yes' : p.shared ? 'Only as proportions' : 'No'}
                        </span>
                      </td>
                      <td className="py-1 pl-3 pr-4 text-right">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          aria-label={`Ratio of ${nameOf(p.child)} per ${nameOf(d.parent)}`}
                          value={Number(p.ratio.toPrecision(5))}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            setOverrides((o) => {
                              const next = { ...o }
                              if (e.target.value === '' || !(v >= 0)) delete next[k]
                              else next[k] = v
                              return next
                            })
                          }}
                          className="figures w-28 rounded-md border border-rule bg-panel px-2 py-0.5 text-right"
                        />
                      </td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </div>
        <p className="max-w-[90ch] px-4 pb-4 pt-3 text-[12.5px] text-ink-2">
          G.I. nuts and bolts are needed by all three sets, so their usage cannot be pinned on one. It is split between the
          sets in the proportions Lumino gave, which is why that part agrees only as proportions.
        </p>
      </Panel>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Segmented
          label="Set"
          value={si}
          onChange={setSi}
          options={check.defs.map((d, i) => ({ value: i, label: nameOf(d.parent) }))}
        />
        <Segmented
          label="What to count"
          value={lens}
          onChange={setLens}
          options={[
            { value: 'supplied', label: 'Everything sent to the godown' },
            { value: 'shelf', label: 'Only what is on the shelf' },
          ]}
        />
      </div>

      <Panel
        title={`${parentName}: how many could be fitted out`}
        note={
          lens === 'supplied'
            ? 'Parents sent to the six godowns so far. Sets are used up in their ratio, so a parent sent without its parts is waiting wherever it lies, on the shelf or with a contractor.'
            : 'Parents on the shelf in the six godowns at each month end, against the parts on the same shelf.'
        }
        aside={<Legend series={bands} />}
      >
        <TimeChart
          months={months}
          ariaLabel={`${parentName}: fitted out and waiting, by month`}
          unit={parentUnit}
          areas={bands}
          cursor={m}
          onCursor={(month) => set({ month })}
          padLeft={92}
          height={220}
        />
        <div className="mt-4 border-t border-rule pt-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
            <div className="text-[13px] text-ink-2">Every godown and month. Click a cell for the detail.</div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
              {(['ok', 'move', 'order', 'surplus'] as const).map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: KINDS[k].color }} />
                  {KINDS[k].label}
                  <span className="figures text-muted">{tally[k]}</span>
                </li>
              ))}
            </ul>
          </div>
          <StatusRows
            kinds={kinds}
            selectedRow={g}
            cursor={m}
            padLeft={92}
            onPick={(godown, month) => set({ godown, month })}
            describe={(row, month) => {
              const b = check.balance[si][row][month]
              const k = kinds[row][month]
              return k === 'empty'
                ? KINDS.empty.label
                : `${KINDS[k].label}. ${qty(Math.ceil(b.stranded))} of ${qty(b.parentStock)} ${parents} waiting.`
            }}
          />
        </div>
        <p className="mt-3 max-w-[90ch] text-[12.5px] text-ink-2">
          Out of balance in {tally.move + tally.order + tally.surplus} of {live} godown-months with stock. Short means a part
          covers less than {SHORT_BELOW * 100}% of the parents beside it. Ahead means it covers more than {SURPLUS_ABOVE * 100}%.
        </p>
      </Panel>

      <Panel
        flush
        title={`${godownShort(godowns[g].name)}, ${monthLabel(months[m])}: ${KINDS[kind].label.toLowerCase()}`}
        aside={
          <div className="w-full sm:w-80">
            <MonthPicker month={m} set={(month) => set({ month })} />
          </div>
        }
      >
        <p className="max-w-[84ch] px-4 pb-3 text-[14.5px]">
          {kind === 'empty' ? (
            <>Nothing of this set has reached {godownShort(godowns[g].name)} yet.</>
          ) : (
            <>
              {godownShort(godowns[g].name)} has {qty(here.parentStock)} {parents} {counted}. The parts {counted} can fit
              out {qty(Math.floor(here.complete))} of them.{' '}
              {here.stranded >= 1 ? (
                <>
                  <strong>
                    {qty(Math.ceil(here.stranded))} are waiting, held up by {limitingName}.
                  </strong>{' '}
                  {kind === 'move'
                    ? 'The other godowns hold enough to cover it, so a transfer puts this right without buying anything.'
                    : kind === 'order'
                      ? `The six godowns together are short too: ${qty(Math.ceil(everywhere.stranded))} ${parents} are waiting across the project. Only an order fixes that.`
                      : ''}
                </>
              ) : (
                'None are waiting.'
              )}
            </>
          )}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13.5px] whitespace-nowrap">
            <thead>
              <tr className="text-right text-[12.5px] text-ink-2">
                <th className="py-1.5 pl-4 pr-3 text-left font-medium">Part</th>
                <th className="px-3 py-1.5 font-medium">Counted here</th>
                <th className="px-3 py-1.5 font-medium">Needed for the parents here</th>
                <th className="px-3 py-1.5 font-medium">Covers</th>
                <th className="px-3 py-1.5 font-medium">Short by</th>
                <th className="py-1.5 pl-3 pr-4 text-left font-medium">What to do</th>
              </tr>
            </thead>
            <tbody>
              {here.parts.map((p) => {
                const whole = everywhere.parts.find((x) => x.child === p.child)!
                const unit = unitOf(p.child)
                const action =
                  p.status === 'short'
                    ? whole.status === 'short'
                      ? `Order. The project is ${qty(whole.missing)} ${unit} short.`
                      : `Move ${qty(p.missing)} ${unit} in from another godown.`
                    : p.status === 'surplus'
                      ? `Hold. ${qty(p.have - p.need)} ${unit} more than the parents here need.`
                      : 'Nothing.'
                return (
                  <tr key={p.child} className="border-t border-rule">
                    <td className="py-1.5 pl-4 pr-3 font-medium">{nameOf(p.child)}</td>
                    <td className="figures narrow px-3 py-1.5 text-right">
                      {qty(p.have)} {unit}
                    </td>
                    <td className="figures narrow px-3 py-1.5 text-right">
                      {qty(p.need)} {unit}
                    </td>
                    <td className="figures narrow px-3 py-1.5 text-right">
                      {p.coverage === null ? '–' : `${Math.round(Math.min(p.coverage, 9.99) * 100)}%`}
                    </td>
                    <td className={`figures narrow px-3 py-1.5 text-right ${p.missing > 0 && p.status === 'short' ? 'font-semibold text-critical' : 'text-axis'}`}>
                      {p.status === 'short' ? `${qty(p.missing)} ${unit}` : '–'}
                    </td>
                    <td className="py-1.5 pl-3 pr-4">{action}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="h-3" />
      </Panel>
    </div>
  )
}
