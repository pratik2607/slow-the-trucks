// Idle stock in rupees. The quantities are Lumino's; the rates are a card anyone can edit.

import { Legend, TimeChart, type Series } from '../components/chart'
import { Figure, Panel } from '../components/ui'
import { ASSUMED_RATES, type MoneyView, type RateCard } from '../engine/money'
import { monthLabel, rupees, shortName, unitWord } from '../lib/format'
import { months, project } from '../model'

const REAL = 'var(--color-real)'
const PLAN = 'var(--color-plan)'

const crore = (v: number) => `₹${(v / 1e7).toFixed(v >= 1e8 || v === 0 ? 0 : 1)} cr`

export const usingAssumedRates = (rates: RateCard): boolean =>
  rates.carryPerYear === ASSUMED_RATES.carryPerYear &&
  project.items.every((i) => rates.perUnit[i.code] === ASSUMED_RATES.perUnit[i.code])

export function MoneyPanel({
  money,
  rates,
  setRates,
  month,
  setMonth,
}: {
  money: MoneyView
  rates: RateCard
  setRates: (next: RateCard) => void
  month: number
  setMonth: (month: number) => void
}) {
  const assumed = usingAssumedRates(rates)
  const lines: Series[] = [
    { key: 'real', label: 'What really sat idle', color: REAL, values: money.real },
    { key: 'plan', label: 'With the planner', color: PLAN, values: money.plan },
  ]
  const byCode = Object.fromEntries(money.byItem.map((i) => [i.code, i]))

  return (
    <Panel
      title="The same thing in rupees, all 16 items together"
      note={
        assumed
          ? "Lumino's data has no prices. These figures use the rate card below: rough market guesses made at the hackathon, not Lumino's rates. Change any rate and every figure follows."
          : 'These figures use the rates you entered in the rate card below.'
      }
      aside={<Legend series={lines} />}
    >
      <div className="grid grid-cols-2 gap-y-4 lg:grid-cols-4">
        <Figure label="Money sitting idle, on average" value={rupees(money.avgPlan)} hint={`really ${rupees(money.avgReal)}`} />
        <Figure
          label="In the worst month"
          value={rupees(money.peakPlan)}
          hint={`really ${rupees(money.peakReal)}, in ${monthLabel(months[money.peakRealMonth])}`}
        />
        <Figure
          label="Holding cost avoided"
          value={rupees(Math.max(0, money.carryReal - money.carryPlan))}
          hint={`at ${(rates.carryPerYear * 100).toFixed(0)}% a year, over ${months.length} months`}
        />
        <Figure label="Bought and never needed" value={rupees(money.unusedPlan)} hint={`really ${rupees(money.unusedReal)}`} />
      </div>

      <div className="mt-4">
        <TimeChart
          months={months}
          ariaLabel="Value of idle stock, reality against the plan"
          unit="rupees"
          lines={lines}
          format={rupees}
          tickFormat={crore}
          cursor={month}
          onCursor={setMonth}
          padLeft={64}
          height={210}
        />
      </div>

      <details className="mt-4 border-t border-rule pt-3">
        <summary className="cursor-pointer text-[14px] font-semibold">
          Rate card: {assumed ? "assumed rates, not Lumino's" : 'your rates'}
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
          <label className="flex items-center gap-2">
            <span>Cost of holding stock for a year</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={Number((rates.carryPerYear * 100).toFixed(2))}
              onChange={(e) => setRates({ ...rates, carryPerYear: Math.max(0, Number(e.target.value) || 0) / 100 })}
              className="figures w-20 rounded-md border border-rule bg-panel px-2 py-1 text-right"
            />
            <span>% of its value</span>
          </label>
          <button
            type="button"
            disabled={assumed}
            onClick={() => setRates(ASSUMED_RATES)}
            className="rounded-md border border-rule px-2.5 py-1 hover:bg-cement disabled:cursor-default disabled:opacity-40"
          >
            Back to the assumed rates
          </button>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[13px] whitespace-nowrap">
            <thead>
              <tr className="text-right text-[12.5px] text-ink-2">
                <th className="py-1.5 pr-3 text-left font-medium">Item</th>
                <th className="px-3 py-1.5 font-medium">Rupees per unit</th>
                <th className="px-3 py-1.5 font-medium">Idle on average, really</th>
                <th className="px-3 py-1.5 font-medium">With the planner</th>
                <th className="py-1.5 pl-3 font-medium">Holding cost avoided</th>
              </tr>
            </thead>
            <tbody>
              {project.items.map((item) => {
                const row = byCode[item.code]
                return (
                  <tr key={item.code} className="border-t border-rule">
                    <td className="py-1 pr-3">
                      {shortName(item)} <span className="text-[12px] text-muted">per {unitWord(item.unit).replace(/s$/, '')}</span>
                    </td>
                    <td className="px-3 py-1 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        aria-label={`Rupees per unit of ${shortName(item)}`}
                        value={rates.perUnit[item.code] ?? 0}
                        onChange={(e) =>
                          setRates({ ...rates, perUnit: { ...rates.perUnit, [item.code]: Math.max(0, Number(e.target.value) || 0) } })
                        }
                        className="figures w-28 rounded-md border border-rule bg-panel px-2 py-0.5 text-right"
                      />
                    </td>
                    <td className="figures narrow px-3 py-1 text-right">{rupees(row.avgReal)}</td>
                    <td className="figures narrow px-3 py-1 text-right font-semibold">{rupees(row.avgPlan)}</td>
                    <td className="figures narrow py-1 pl-3 text-right">{row.carrySaved > 0 ? rupees(row.carrySaved) : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </Panel>
  )
}
