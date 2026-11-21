// Job 1, "See it": for every item and every godown, month by month, what came in, what went to
// contractors, what was actually used, and what sat idle.

import { useEffect, useMemo, useRef } from 'react'
import { HeatRows, Legend, Sparkline, TimeChart, type Series } from '../components/chart'
import { Figure, MonthPicker, Panel, Segmented } from '../components/ui'
import { addSeries, sum } from '../engine/ledger'
import { cover, godownShort, monthLabel, percent, qty, shortName, unitWord } from '../lib/format'
import { godowns, ledgers, months, project, summaries, type Selection, type SetSelection } from '../model'
import { PageHeader } from './parts/shared'

const REAL = 'var(--color-real)'
const HELD = 'var(--color-held)'
const SLATE = '#4d5761'
const SLATE_LIGHT = '#a9b1b8'
/** Left edge shared by the three time panels, so months line up down the page. */
const PLOT_LEFT = 92

const ranked = [...project.items].sort((a, b) => summaries[b.code].avgCoverMonths - summaries[a.code].avgCoverMonths)
const longestCover = Math.max(...ranked.map((i) => summaries[i.code].avgCoverMonths))

function ItemsTable({ sel, set }: { sel: Selection; set: SetSelection }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[13.5px] whitespace-nowrap">
        <thead>
          <tr className="text-left text-[12.5px] text-ink-2">
            <th className="py-1.5 pl-4 pr-3 font-medium">Item</th>
            <th className="px-3 py-1.5 text-right font-medium">Arrives in</th>
            <th className="px-3 py-1.5 font-medium">Held on average, in months of usage</th>
            <th className="px-3 py-1.5 text-right font-medium">Most ever idle</th>
            <th className="px-3 py-1.5 text-right font-medium">Received</th>
            <th className="px-3 py-1.5 text-right font-medium">Used</th>
            <th className="px-3 py-1.5 text-right font-medium">Never used</th>
            <th className="py-1.5 pl-3 pr-4 font-medium">Idle stock over time</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((item) => {
            const s = summaries[item.code]
            const selected = item.code === sel.item
            const leadMonths = item.leadDays / 30
            return (
              <tr
                key={item.code}
                onClick={() => set({ item: item.code })}
                className={`cursor-pointer border-t border-rule ${selected ? 'bg-cement' : 'hover:bg-cement/50'}`}
              >
                <td className={`py-1.5 pl-4 pr-3 ${selected ? 'shadow-[inset_3px_0_0_var(--color-ink)]' : ''}`}>
                  <button type="button" className={`text-left ${selected ? 'font-bold' : 'font-medium'}`} aria-pressed={selected}>
                    {shortName(item)}
                  </button>
                  {item.role !== 'Independent' && (
                    <span className="ml-2 text-[12px] text-muted">{item.role === 'Parent' ? 'a set' : 'part of a set'}</span>
                  )}
                </td>
                <td className="figures px-3 py-1.5 text-right text-ink-2">{item.leadDays} days</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="relative h-3 w-40 shrink-0">
                      <div
                        className="absolute inset-y-0 left-0 rounded-r-[3px] bg-real"
                        style={{ width: `${(s.avgCoverMonths / longestCover) * 100}%` }}
                      />
                      <div
                        className="absolute -inset-y-1 w-0.5 bg-ink"
                        style={{ left: `${(leadMonths / longestCover) * 100}%` }}
                        title={`Lead time: ${leadMonths} months`}
                      />
                    </div>
                    <span className="figures narrow font-semibold">{cover(s.avgCoverMonths)}</span>
                  </div>
                </td>
                <td className="figures narrow px-3 py-1.5 text-right">
                  {qty(s.peakIdle)} <span className="text-muted">{monthLabel(months[s.peakIdleMonth])}</span>
                </td>
                <td className="figures narrow px-3 py-1.5 text-right">{qty(s.received)}</td>
                <td className="figures narrow px-3 py-1.5 text-right">{qty(s.used)}</td>
                <td className="figures narrow px-3 py-1.5 text-right">{percent(s.unusedShare)}</td>
                <td className="py-1 pl-3 pr-4">
                  <Sparkline values={ledgers[item.code].idle} color={REAL} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface Column {
  head: string
  get: (m: number) => number | null
  strong?: boolean
  isCover?: boolean
}

function Register({ columns, month, set }: { columns: Column[]; month: number; set: SetSelection }) {
  const box = useRef<HTMLDivElement>(null)
  const rows = useRef<(HTMLTableRowElement | null)[]>([])

  // Keep the chosen month in view without ever scrolling the page itself.
  useEffect(() => {
    const el = box.current
    const row = rows.current[month]
    if (!el || !row) return
    const above = row.offsetTop - 34 < el.scrollTop
    const below = row.offsetTop + row.offsetHeight > el.scrollTop + el.clientHeight
    if (above || below) el.scrollTop = row.offsetTop - el.clientHeight / 2
  }, [month])

  return (
    <div ref={box} className="relative max-h-[400px] overflow-auto">
      <table className="w-full min-w-[720px] border-collapse text-[13px]">
        <thead>
          <tr className="text-right text-[12.5px] text-ink-2">
            <th className="sticky top-0 bg-panel py-1.5 pl-4 pr-3 text-left font-medium shadow-[inset_0_-1px_0_var(--color-rule)]">Month</th>
            {columns.map((c) => (
              <th key={c.head} className="sticky top-0 bg-panel px-3 py-1.5 font-medium shadow-[inset_0_-1px_0_var(--color-rule)] last:pr-4">
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((ym, m) => (
            <tr
              key={ym}
              ref={(el) => {
                rows.current[m] = el
              }}
              onClick={() => set({ month: m })}
              className={`cursor-pointer border-t border-rule ${m === month ? 'bg-cement font-semibold' : 'hover:bg-cement/50'}`}
            >
              <td className={`figures py-1 pl-4 pr-3 ${m === month ? 'shadow-[inset_3px_0_0_var(--color-ink)]' : ''}`}>{monthLabel(ym)}</td>
              {columns.map((c) => {
                const v = c.get(m)
                const empty = v === null || Math.abs(v) < 0.0005
                return (
                  <td key={c.head} className={`figures narrow px-3 py-1 text-right last:pr-4 ${empty ? 'text-axis' : c.strong ? 'font-semibold' : ''}`}>
                    {empty ? '–' : c.isCover ? cover(v) : qty(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SeeIt({ sel, set }: { sel: Selection; set: SetSelection }) {
  const l = ledgers[sel.item]
  const s = summaries[sel.item]
  const unit = unitWord(l.item.unit)
  const g = sel.godown >= 0 ? l.godowns[sel.godown] : null
  const godownName = sel.godown >= 0 ? godownShort(godowns[sel.godown].name) : ''
  const m = sel.month

  const view = useMemo(() => {
    if (g) {
      const stock: Series[] = [{ key: 'godown', label: `In ${godownName} godown`, color: REAL, values: g.closing }]
      const up: Series = { key: 'in', label: 'Came in', color: SLATE, values: addSeries(g.rec, g.tin, g.ret) }
      const down: Series = { key: 'out', label: 'Went out', color: SLATE_LIGHT, values: addSeries(g.iss, g.tout, g.close) }
      return { stock, up, down }
    }
    const stock: Series[] = [
      { key: 'godowns', label: 'In the six godowns', color: REAL, values: l.inGodowns },
      { key: 'contractors', label: 'With contractors', color: HELD, values: l.withContractors },
    ]
    const up: Series = { key: 'in', label: 'Arrived from vendors', color: SLATE, values: l.received }
    const down: Series = { key: 'out', label: 'Used at site', color: SLATE_LIGHT, values: l.used }
    return { stock, up, down }
  }, [g, l, godownName])

  const columns: Column[] = g
    ? [
        { head: 'Opening', get: (i) => g.opening[i] },
        { head: 'From vendors', get: (i) => g.rec[i] },
        { head: 'Transfer in', get: (i) => g.tin[i] },
        { head: 'Transfer out', get: (i) => g.tout[i] },
        { head: 'To closing store', get: (i) => g.close[i] },
        { head: 'Issued', get: (i) => g.iss[i] },
        { head: 'Returned', get: (i) => g.ret[i] },
        { head: 'Closing, idle', get: (i) => g.closing[i], strong: true },
      ]
    : [
        { head: 'From vendors', get: (i) => l.received[i] },
        { head: 'Issued', get: (i) => l.issued[i] },
        { head: 'Returned', get: (i) => l.returned[i] },
        { head: 'Used at site', get: (i) => l.used[i] },
        { head: 'In godowns', get: (i) => l.inGodowns[i], strong: true },
        { head: 'With contractors', get: (i) => l.withContractors[i], strong: true },
        { head: 'Months of cover', get: (i) => l.coverMonths[i], isCover: true },
      ]

  const peak = s.peakIdleMonth
  const godownPeak = g ? g.closing.indexOf(Math.max(...g.closing)) : 0

  return (
    <div className="grid gap-4">
      <PageHeader title="Stock register" job="Job 1: See it">
        What came in, what went to contractors, what was used and what sat idle: every item, every godown, every month. Pick an item in the table, then a godown.
      </PageHeader>
      <Panel
        flush
        title="All 16 items, worst first"
        note="The bar is how much stock sat idle on average, counted in months of real usage. The black tick is how long a fresh order takes to arrive. A bar far past its tick is stock nobody was waiting for."
      >
        <ItemsTable sel={sel} set={set} />
      </Panel>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="wide text-[22px] font-bold leading-tight">{shortName(l.item)}</h2>
          <p className="text-[12.5px] text-muted">
            {l.item.name}, counted in {unit}, arrives {l.item.leadDays} days after ordering
          </p>
        </div>
        <Segmented
          label="Godown"
          value={sel.godown}
          onChange={(godown) => set({ godown })}
          options={[{ value: -1, label: 'All six' }, ...godowns.map((gd, i) => ({ value: i, label: godownShort(gd.name) }))]}
        />
      </div>

      <p className="max-w-[78ch] text-[15px]">
        {g ? (
          <>
            {godownName} godown took in {qty(sum(g.rec))} {unit} from vendors and {qty(sum(g.tin))} from other stores. It
            gave {qty(sum(g.iss))} to contractors and got {qty(sum(g.ret))} back. The most it ever held was{' '}
            {qty(g.closing[godownPeak])} {unit}, in {monthLabel(months[godownPeak])}. Lumino records usage for the whole
            project, so what was used at site appears only under All six.
          </>
        ) : (
          <>
            {qty(s.received)} {unit} arrived and {qty(s.used)} were used at site. Idle stock peaked in{' '}
            {monthLabel(months[peak])} at {qty(s.peakIdle)} {unit}: {qty(l.inGodowns[peak])} in godowns and{' '}
            {qty(l.withContractors[peak])} with contractors. That was {cover(s.peakCoverMonths)} months of work at the
            pace of the time, for an item that arrives in {l.item.leadDays} days.
          </>
        )}
      </p>

      <Panel
        title="What sat idle"
        note={g ? 'Stock in this godown at each month end.' : 'Stock at each month end, in godowns and lying with contractors.'}
        aside={view.stock.length > 1 ? <Legend series={view.stock} /> : undefined}
      >
        <TimeChart
          months={months}
          ariaLabel={`Idle stock of ${shortName(l.item)} by month`}
          unit={unit}
          areas={view.stock}
          cursor={m}
          onCursor={(month) => set({ month })}
          padLeft={PLOT_LEFT}
          height={230}
        />
        <div className="mt-4 border-t border-rule pt-3">
          <div className="mb-1.5 text-[13px] text-ink-2">Where it sat: stock in each godown. Click a cell to open that godown and month.</div>
          <HeatRows
            months={months}
            rows={godowns.map((gd, i) => ({
              label: godownShort(gd.name),
              short: godownShort(gd.name).slice(0, 3),
              values: l.godowns[i].closing,
            }))}
            color={REAL}
            unit={unit}
            noun="Stock"
            selectedRow={sel.godown}
            cursor={m}
            onPick={(godown, month) => set({ godown, month })}
            padLeft={PLOT_LEFT}
          />
        </div>
      </Panel>

      <Panel
        title="What came in and what went out"
        note={
          g
            ? 'Above the line: receipts, transfers in and returns. Below: issues to contractors and transfers out.'
            : 'Above the line: deliveries from vendors. Below: what the site actually used.'
        }
        aside={<Legend series={[view.up, view.down]} />}
      >
        <TimeChart
          months={months}
          ariaLabel={`Monthly movement of ${shortName(l.item)}`}
          unit={unit}
          up={view.up}
          down={view.down}
          cursor={m}
          onCursor={(month) => set({ month })}
          padLeft={PLOT_LEFT}
          height={200}
        />
      </Panel>

      <Panel
        flush
        title={`Stock register, ${g ? `${godownName} godown` : 'all six godowns'}`}
        note={`Every month of the project, in ${unit}. Click a row to move the month marker.`}
        aside={
          <div className="w-full sm:w-80">
            <MonthPicker month={m} set={(month) => set({ month })} />
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-y-3 px-4 pb-3 sm:grid-cols-4">
          {g ? (
            <>
              <Figure label={`Opened ${monthLabel(months[m])} with`} value={qty(g.opening[m])} unit={unit} />
              <Figure label="Came in" value={qty(g.rec[m] + g.tin[m] + g.ret[m])} unit={unit} />
              <Figure label="Went out" value={qty(g.iss[m] + g.tout[m] + g.close[m])} unit={unit} />
              <Figure label="Left sitting" value={qty(g.closing[m])} unit={unit} />
            </>
          ) : (
            <>
              <Figure label={`Arrived in ${monthLabel(months[m])}`} value={qty(l.received[m])} unit={unit} />
              <Figure label="Used at site" value={qty(l.used[m])} unit={unit} />
              <Figure label="Sitting idle at month end" value={qty(l.idle[m])} unit={unit} />
              <Figure label="That idle stock would last" value={cover(l.coverMonths[m])} unit={l.coverMonths[m] === null ? undefined : 'months'} />
            </>
          )}
        </div>
        <Register columns={columns} month={m} set={set} />
      </Panel>
    </div>
  )
}
