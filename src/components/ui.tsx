import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { monthLabel, shortName } from '../lib/format'
import { months, project } from '../model'

const ITEM_GROUPS = [
  ['Independent', 'Items'],
  ['Parent', 'Sets'],
  ['Child', 'Parts of a set'],
] as const

export function ItemSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-2">
      <span>Item</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-rule bg-panel px-2 py-1.5 text-[14px] font-semibold text-ink"
      >
        {ITEM_GROUPS.map(([role, label]) => (
          <optgroup key={role} label={label}>
            {project.items
              .filter((i) => i.role === role)
              .map((i) => (
                <option key={i.code} value={i.code}>
                  {shortName(i)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/** The month slider with a play button that walks through the project one month at a time. */
export function Scrubber({ month, set }: { month: number; set: (month: number) => void }) {
  const [playing, setPlaying] = useState(false)
  const latest = useRef(set)
  latest.current = set
  const last = months.length - 1

  useEffect(() => {
    if (!playing) return
    if (month >= last) {
      setPlaying(false)
      return
    }
    const id = window.setTimeout(() => latest.current(month + 1), 380)
    return () => window.clearTimeout(id)
  }, [playing, month, last])

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <button
        type="button"
        onClick={() => {
          if (!playing && month >= last) set(0)
          setPlaying((p) => !p)
        }}
        className="w-[7.5rem] shrink-0 rounded-md bg-ink px-3 py-1.5 text-[13px] font-semibold text-panel"
      >
        {playing ? 'Pause' : 'Play the replay'}
      </button>
      <div className="min-w-0 flex-1">
        <MonthPicker
          month={month}
          set={(m) => {
            setPlaying(false)
            set(m)
          }}
        />
      </div>
    </div>
  )
}

export function Panel({
  title,
  note,
  aside,
  children,
  flush = false,
}: {
  title?: ReactNode
  note?: ReactNode
  aside?: ReactNode
  children: ReactNode
  /** Lets the content run edge to edge (tables). */
  flush?: boolean
}) {
  return (
    <section className="rounded-md border border-rule bg-panel">
      {(title || aside) && (
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 pt-3.5">
          <div className="max-w-[72ch]">
            {title && <h3 className="text-[15px] font-semibold">{title}</h3>}
            {note && <p className="mt-0.5 text-[13px] text-ink-2">{note}</p>}
          </div>
          {aside}
        </header>
      )}
      <div className={flush ? 'pt-3' : 'px-4 pb-4 pt-3'}>{children}</div>
    </section>
  )
}

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-md border border-rule bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-[5px] px-2.5 py-1 text-[13px] ${
            o.value === value ? 'bg-ink font-semibold text-panel' : 'text-ink-2 hover:bg-cement'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function MonthPicker({ month, set }: { month: number; set: (month: number) => void }) {
  return (
    <label className="flex min-w-0 items-center gap-3 text-[13px] text-ink-2">
      <span className="shrink-0">Month</span>
      <input
        type="range"
        min={0}
        max={months.length - 1}
        value={month}
        onChange={(e) => set(Number(e.target.value))}
        className="min-w-0 flex-1"
      />
      <span className="figures w-[4.6rem] shrink-0 text-right font-semibold text-ink">{monthLabel(months[month])}</span>
    </label>
  )
}

/** One labelled figure. Used in rows separated by hairlines, never as a floating card. */
export function Figure({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="min-w-0 border-l border-rule pl-3 first:border-l-0 first:pl-0">
      <div className="text-[12.5px] text-ink-2">{label}</div>
      <div className="narrow figures mt-0.5 text-[22px] font-semibold leading-tight">
        {value}
        {unit && <span className="ml-1 text-[12.5px] font-normal text-ink-2">{unit}</span>}
      </div>
      {hint && <div className="text-[12px] text-muted">{hint}</div>}
    </div>
  )
}
