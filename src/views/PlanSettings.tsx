// Plan settings: everything behind the plan that can be changed, with the trade-off shown openly.

import { useMemo } from 'react'
import { scaleLinear } from 'd3-scale'
import { Legend, useWidth } from '../components/chart'
import { Panel, Segmented } from '../components/ui'
import type { PlanSettings as Settings_ } from '../engine/planner'
import { project, replay, type Replay } from '../model'
import { PageHeader } from './parts/shared'

type PlanSettings = Settings_
const PLAN = 'var(--color-plan)'
const CAUTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]
const MAX_CAUTION = 4

function Settings({ settings, set }: { settings: PlanSettings; set: (patch: Partial<PlanSettings>) => void }) {
  return (
    <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
      <div className="text-[13px]">
        <label className="block">
          <span className="font-semibold">Buffer</span>
          <span className="ml-2 text-ink-2">{settings.caution.toFixed(2)} times the usual month-to-month swing</span>
          <input
            type="range"
            min={0}
            max={MAX_CAUTION}
            step={0.25}
            value={settings.caution}
            onChange={(e) => set({ caution: Number(e.target.value) })}
            className="mt-1.5 block w-full"
          />
          <span className="flex justify-between text-[12px] text-muted">
            <span>lean</span>
            <span>cautious</span>
          </span>
        </label>
        <div className="mb-1.5 mt-3 font-semibold">How far back it looks</div>
        <Segmented
          label="How far back the planner looks"
          value={settings.lookback}
          onChange={(lookback) => set({ lookback })}
          options={[
            { value: 6, label: '6 months' },
            { value: 9, label: '9 months' },
            { value: 12, label: '12 months' },
          ]}
        />
      </div>
      <div className="text-[13px]">
        <div className="mb-1.5 font-semibold">What counts as the site's need</div>
        <Segmented
          label="What counts as the site's need"
          value={settings.signal}
          onChange={(signal) => set({ signal })}
          options={[
            { value: 'usage', label: 'What the site used' },
            { value: 'issues', label: 'What contractors drew' },
          ]}
        />
        <p className="mt-1.5 text-[12.5px] text-ink-2">
          {settings.signal === 'usage'
            ? 'Idle stock is everything that arrived and was not used, in a godown or with a contractor. Usage is recorded for the whole project, so its split between godowns is an estimate.'
            : 'Stricter and exact per godown, but material pushed out to contractors counts as if it had been needed.'}
        </p>
      </div>
      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={settings.knowsTotal}
          onChange={(e) => set({ knowsTotal: e.target.checked })}
          className="mt-0.5 h-4 w-4 accent-ink"
        />
        <span>
          <span className="font-semibold">Hold to the planned project quantity</span>
          <span className="mt-0.5 block text-[12.5px] text-ink-2">
            Lumino orders to a fixed plan made months ahead, so each item's total is settled before work starts. The data pack does not state that total, so it
            is taken as what the fixed plan delivered. The planner never orders beyond it. Switch this off if orders were placed as needs arose.
          </span>
        </span>
      </label>
    </div>
  )
}

function TradeOff({
  points,
  caution,
  onPick,
}: {
  points: { caution: number; cut: number; onTime: number }[]
  caution: number
  onPick: (caution: number) => void
}) {
  const [ref, width] = useWidth()
  const H = 190
  const pad = { l: 44, r: 16, t: 14, b: 34 }
  const x = scaleLinear().domain([0, MAX_CAUTION]).range([pad.l, Math.max(pad.l + 1, width - pad.r)])
  const y = scaleLinear().domain([0, 1]).range([H - pad.b, pad.t])
  const path = (key: 'cut' | 'onTime') =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.caution).toFixed(1)} ${y(Math.max(0, p[key])).toFixed(1)}`).join('')
  const here = points.reduce((best, p) => (Math.abs(p.caution - caution) < Math.abs(best.caution - caution) ? p : best), points[0])

  return (
    <div ref={ref}>
      <svg width={width} height={H} role="img" aria-label="Idle stock removed and need met on time, by buffer size" className="block">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--color-axis)' : 'var(--color-rule)'} />
            <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill="var(--color-muted)" className="figures">
              {t * 100}%
            </text>
          </g>
        ))}
        {CAUTIONS.map((c) => (
          <text key={c} x={x(c)} y={H - pad.b + 14} textAnchor="middle" fontSize={11} fill="var(--color-muted)" className="figures">
            {c}
          </text>
        ))}
        <text x={pad.l} y={H - 4} fontSize={11.5} fill="var(--color-ink-2)">
          Buffer: lean
        </text>
        <text x={width - pad.r} y={H - 4} textAnchor="end" fontSize={11.5} fill="var(--color-ink-2)">
          cautious
        </text>
        <line x1={x(here.caution)} x2={x(here.caution)} y1={pad.t} y2={H - pad.b} stroke="var(--color-ink)" />
        <path d={path('onTime')} fill="none" stroke="var(--color-ink-2)" strokeWidth={2} strokeLinejoin="round" />
        <path d={path('cut')} fill="none" stroke={PLAN} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p) => (
          <g key={p.caution} style={{ cursor: 'pointer' }} onClick={() => onPick(p.caution)}>
            <rect x={x(p.caution) - 14} y={pad.t} width={28} height={H - pad.b - pad.t} fill="transparent" />
            <circle cx={x(p.caution)} cy={y(Math.max(0, p.onTime))} r={4} fill="var(--color-ink-2)" stroke="var(--color-panel)" strokeWidth={2} />
            <circle cx={x(p.caution)} cy={y(Math.max(0, p.cut))} r={4} fill={PLAN} stroke="var(--color-panel)" strokeWidth={2} />
          </g>
        ))}
      </svg>
    </div>
  )
}

export function PlanSettingsView({ run, setSettings }: { run: Replay; setSettings: (patch: Partial<PlanSettings>) => void }) {
  // For every buffer size: how much idle stock a typical item loses, and what share of the 16
  // items the site never has to wait for.
  const points = useMemo(
    () =>
      CAUTIONS.map((caution) => {
        const r = caution === run.settings.caution ? run : replay({ ...run.settings, caution })
        const cuts = project.items.map((i) => r.scores[i.code].idleCut).sort((a, b) => a - b)
        return {
          caution,
          cut: (cuts[7] + cuts[8]) / 2,
          onTime: project.items.filter((i) => r.scores[i.code].shortMonths === 0).length / project.items.length,
        }
      }),
    [run],
  )

  return (
    <div className="grid gap-6">
      <PageHeader title="Plan settings">Everything behind the plan that can be changed. Changes apply to every screen at once.</PageHeader>
      <Panel
        title="Buffer"
        note="Less buffer means less idle stock and more risk of the site waiting. Both are shown, so the choice is open and not hidden in the model."
        aside={
          <Legend
            series={[
              { key: 'cut', label: 'Idle stock removed, typical item', color: PLAN },
              { key: 'onTime', label: 'Items the site never waits for', color: 'var(--color-ink-2)' },
            ]}
          />
        }
      >
        <TradeOff points={points} caution={run.settings.caution} onPick={(caution) => setSettings({ caution })} />
      </Panel>
      <Panel title="How the planner works">
        <Settings settings={run.settings} set={setSettings} />
      </Panel>
    </div>
  )
}
