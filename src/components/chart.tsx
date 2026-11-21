// Hand-built SVG charts. One y-axis each, thin marks, a legend whenever there are two or more
// series, and a hover readout on every chart. Text stays in ink; colour only marks identity.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { scaleLinear } from 'd3-scale'
import { area as areaShape, line as lineShape } from 'd3-shape'
import { compact, monthLabel, qty } from '../lib/format'

export interface Series {
  key: string
  label: string
  color: string
  values: readonly number[]
  dashed?: boolean
}

/** Tracks the pixel width of a block so the SVG can be drawn at 1:1. */
export function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.floor(el.getBoundingClientRect().width))
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export function Legend({ series }: { series: Pick<Series, 'key' | 'label' | 'color' | 'dashed'>[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={s.dashed ? { border: `2px dashed ${s.color}` } : { background: s.color }}
          />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

const NO_SERIES: Series[] = []
const NO_MARKS: { month: number; label: string }[] = []
const PAD_RIGHT = 10
const PAD_TOP = 14
const PAD_BOTTOM = 22

/** Left edge of the plot. Shared so charts stacked on a page line up month for month. */
export const plotLeft = (width: number, wanted: number): number => (width < 520 ? Math.min(wanted, 44) : wanted)

interface TimeChartProps {
  months: readonly string[]
  ariaLabel: string
  unit: string
  height?: number
  /** Filled bands, stacked from the baseline, bottom first. */
  areas?: Series[]
  lines?: Series[]
  /** Bars above the zero line. */
  up?: Series
  /** Bars below the zero line. Values stay positive. */
  down?: Series
  cursor?: number
  onCursor?: (month: number) => void
  /** Forces the top of the scale, so side-by-side charts can be compared honestly. */
  yMax?: number
  /** Months to flag along the top edge, each with a reason shown on hover. */
  marks?: { month: number; label: string }[]
  /** Moments worth naming: a dashed line at the start of the month, with a short label. */
  notes?: { month: number; label: string }[]
  padLeft?: number
}

export function TimeChart({
  months,
  ariaLabel,
  unit,
  height = 220,
  areas = NO_SERIES,
  lines = NO_SERIES,
  up,
  down,
  cursor,
  onCursor,
  yMax,
  marks = NO_MARKS,
  notes = NO_MARKS,
  padLeft = 48,
}: TimeChartProps) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<number | null>(null)

  const n = months.length
  const left = plotLeft(width, padLeft)
  const innerW = Math.max(1, width - left - PAD_RIGHT)
  const innerH = height - PAD_TOP - PAD_BOTTOM
  const step = innerW / n
  const cx = (m: number) => left + (m + 0.5) * step

  const bands = useMemo(() => {
    const running = new Array<number>(n).fill(0)
    return areas.map((s) => {
      const y0 = running.slice()
      s.values.forEach((v, m) => (running[m] += v))
      return { s, y0, y1: running.slice() }
    })
  }, [areas, n])

  const top = Math.max(
    1e-9,
    yMax ?? 0,
    ...bands.flatMap((b) => b.y1),
    ...lines.flatMap((s) => s.values),
    ...(up?.values ?? []),
  )
  const below = down ? Math.max(0, ...down.values) : 0
  const y = scaleLinear()
    .domain([-below, top])
    .nice(4)
    .range([PAD_TOP + innerH, PAD_TOP])
  const ticks = y.ticks(4)
  const index = months.map((_, m) => m)
  const barWidth = Math.max(2, step * 0.62)

  const locate = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n)))
  }

  const readout = [...bands.map((b) => b.s).reverse(), ...lines, ...(up ? [up] : []), ...(down ? [down] : [])]
  const flip = hover !== null && cx(hover) > width * 0.58
  const markAt = hover === null ? undefined : marks.find((k) => k.month === hover)

  return (
    <div ref={ref} className="relative select-none">
      <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={left}
              x2={left + innerW}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? 'var(--color-axis)' : 'var(--color-rule)'}
            />
            <text x={left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill="var(--color-muted)" className="figures">
              {compact(Math.abs(t))}
            </text>
          </g>
        ))}
        {months.map((ym, m) =>
          m === 0 || ym.endsWith('-01') ? (
            <g key={ym}>
              <line
                x1={left + m * step}
                x2={left + m * step}
                y1={PAD_TOP + innerH}
                y2={PAD_TOP + innerH + 4}
                stroke="var(--color-axis)"
              />
              <text x={left + m * step + 3} y={height - 5} fontSize={11} fill="var(--color-muted)" className="figures">
                {ym.slice(0, 4)}
              </text>
            </g>
          ) : null,
        )}

        {bands.map((b) => (
          <path
            key={b.s.key}
            d={
              areaShape<number>()
                .x((m) => cx(m))
                .y0((m) => y(b.y0[m]))
                .y1((m) => y(b.y1[m]))(index) ?? undefined
            }
            fill={b.s.color}
            fillOpacity={0.9}
            stroke="var(--color-panel)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ))}
        {up?.values.map((v, m) =>
          v > 0 ? (
            <rect key={m} x={cx(m) - barWidth / 2} y={y(v)} width={barWidth} height={Math.max(0, y(0) - y(v))} rx={1.5} fill={up.color} />
          ) : null,
        )}
        {down?.values.map((v, m) =>
          v > 0 ? (
            <rect key={m} x={cx(m) - barWidth / 2} y={y(0)} width={barWidth} height={Math.max(0, y(-v) - y(0))} rx={1.5} fill={down.color} />
          ) : null,
        )}
        {lines.map((s) => (
          <path
            key={s.key}
            d={
              lineShape<number>()
                .x((m) => cx(m))
                .y((m) => y(s.values[m]))(index) ?? undefined
            }
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={s.dashed ? '5 4' : undefined}
          />
        ))}

        {marks.map((k) => (
          <rect key={k.month} x={cx(k.month) - barWidth / 2} y={PAD_TOP - 8} width={barWidth} height={5} rx={1} fill="var(--color-critical)" />
        ))}
        {notes.map((note, i) => {
          const nx = left + note.month * step
          const flipLabel = nx > left + innerW * 0.7
          return (
            <g key={note.label}>
              <line x1={nx} x2={nx} y1={PAD_TOP} y2={PAD_TOP + innerH} stroke="var(--color-ink-2)" strokeDasharray="3 3" />
              <text
                x={flipLabel ? nx - 5 : nx + 5}
                y={PAD_TOP + 11 + i * 14}
                textAnchor={flipLabel ? 'end' : 'start'}
                fontSize={11.5}
                fill="var(--color-ink-2)"
                stroke="var(--color-panel)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {note.label}
              </text>
            </g>
          )
        })}

        {hover !== null && (
          <line x1={cx(hover)} x2={cx(hover)} y1={PAD_TOP} y2={PAD_TOP + innerH} stroke="var(--color-muted)" strokeDasharray="2 3" />
        )}
        {cursor !== undefined && (
          <g>
            <line x1={cx(cursor)} x2={cx(cursor)} y1={PAD_TOP - 4} y2={PAD_TOP + innerH} stroke="var(--color-ink)" />
            <circle cx={cx(cursor)} cy={PAD_TOP - 4} r={3} fill="var(--color-ink)" />
          </g>
        )}
        <rect
          x={left}
          y={0}
          width={innerW}
          height={height}
          fill="transparent"
          style={{ cursor: onCursor ? 'pointer' : 'default' }}
          onPointerMove={(e) => setHover(locate(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => onCursor?.(locate(e as unknown as PointerEvent<SVGRectElement>))}
        />
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 rounded-md border border-rule bg-panel px-2.5 py-2 text-[12.5px] shadow-[0_6px_18px_-8px_rgba(23,32,43,0.35)]"
          style={{
            top: PAD_TOP,
            left: flip ? undefined : cx(hover) + 12,
            right: flip ? width - cx(hover) + 12 : undefined,
          }}
        >
          <div className="mb-1 font-semibold">{monthLabel(months[hover])}</div>
          {readout.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
              <span className="text-ink-2">{s.label}</span>
              <span className="figures ml-auto pl-3 font-medium">
                {qty(s.values[hover])} {unit}
              </span>
            </div>
          ))}
          {bands.length > 1 && (
            <div className="mt-1 flex border-t border-rule pt-1">
              <span className="text-ink-2">Together</span>
              <span className="figures ml-auto pl-3 font-semibold">
                {qty(bands[bands.length - 1].y1[hover])} {unit}
              </span>
            </div>
          )}
          {markAt && <div className="mt-1 border-t border-rule pt-1 text-critical">{markAt.label}</div>}
        </div>
      )}
    </div>
  )
}

/** A word-sized trend line with its peak marked. */
export function Sparkline({ values, color, width = 120, height = 24 }: { values: readonly number[]; color: string; width?: number; height?: number }) {
  const max = Math.max(1e-9, ...values)
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (width - 4), height - 3 - (v / max) * (height - 6)] as const)
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
  const peak = values.indexOf(Math.max(...values))
  return (
    <svg width={width} height={height} aria-hidden className="block">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts[peak][0]} cy={pts[peak][1]} r={2.5} fill={color} stroke="var(--color-panel)" />
    </svg>
  )
}

interface HeatProps {
  months: readonly string[]
  rows: { label: string; short: string; values: readonly number[] }[]
  color: string
  unit: string
  noun: string
  selectedRow: number
  cursor: number
  onPick: (row: number, month: number) => void
  padLeft?: number
}

/** Rows of months, darker where more is sitting. Lines up under a TimeChart with the same padLeft. */
export function HeatRows({ months, rows, color, unit, noun, selectedRow, cursor, onPick, padLeft = 48 }: HeatProps) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<{ row: number; month: number } | null>(null)
  const n = months.length
  const left = plotLeft(width, padLeft)
  const innerW = Math.max(1, width - left - PAD_RIGHT)
  const step = innerW / n
  const rowH = 22
  const max = Math.max(1e-9, ...rows.flatMap((r) => r.values))
  const height = rows.length * rowH + 4
  const flip = hover !== null && left + hover.month * step > width * 0.58

  return (
    <div ref={ref} className="relative select-none">
      <svg width={width} height={height} role="img" aria-label={`${noun} by godown and month`} className="block">
        {rows.map((r, ri) => (
          <g key={r.label}>
            <text
              x={left - 6}
              y={ri * rowH + rowH / 2 + 3}
              textAnchor="end"
              fontSize={11.5}
              fontWeight={ri === selectedRow ? 700 : 400}
              fill={ri === selectedRow ? 'var(--color-ink)' : 'var(--color-ink-2)'}
            >
              {left < 60 ? r.short : r.label}
            </text>
            {r.values.map((v, m) => (
              <rect
                key={m}
                x={left + m * step + 0.75}
                y={ri * rowH + 1}
                width={Math.max(1, step - 1.5)}
                height={rowH - 3}
                rx={1.5}
                fill={v > 0 ? color : 'var(--color-rule)'}
                fillOpacity={v > 0 ? 0.12 + 0.88 * Math.pow(v / max, 0.7) : 0.55}
                stroke={ri === selectedRow && m === cursor ? 'var(--color-ink)' : 'none'}
                strokeWidth={1.5}
                style={{ cursor: 'pointer' }}
                onPointerEnter={() => setHover({ row: ri, month: m })}
                onPointerLeave={() => setHover(null)}
                onClick={() => onPick(ri, m)}
              />
            ))}
          </g>
        ))}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-rule bg-panel px-2.5 py-1.5 text-[12.5px] whitespace-nowrap shadow-[0_6px_18px_-8px_rgba(23,32,43,0.35)]"
          style={{
            top: hover.row * rowH + rowH + 4,
            left: flip ? undefined : left + hover.month * step + 8,
            right: flip ? width - (left + hover.month * step) + 8 : undefined,
          }}
        >
          <span className="font-semibold">
            {rows[hover.row].label}, {monthLabel(months[hover.month])}
          </span>
          <span className="figures ml-2">
            {qty(rows[hover.row].values[hover.month])} {unit}
          </span>
        </div>
      )}
    </div>
  )
}
