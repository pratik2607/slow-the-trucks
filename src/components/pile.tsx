// The pile: stock drawn the way it lies in a yard, one mark per round number of units.

import { useWidth } from './chart'

/** A round number of units per mark, so the real pile at its worst is a few hundred marks. */
export function unitsPerMark(peak: number): number {
  const raw = peak / 600
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))
  const step = [1, 2, 5, 10].find((s) => s * magnitude >= raw) ?? 10
  return step * magnitude
}

export function Pile({ filled, slots, color, label }: { filled: number; slots: number; color: string; label: string }) {
  const [ref, width] = useWidth()
  const w = width < 380 ? 11 : 15
  const h = 5
  const gap = 3
  const cols = Math.max(1, Math.floor((width + gap) / (w + gap)))
  const rows = Math.ceil(slots / cols)
  const height = rows * (h + gap)
  const whole = Math.floor(filled)

  return (
    <div ref={ref}>
      <svg width={width} height={height} role="img" aria-label={label} className="block">
        {Array.from({ length: slots }, (_, i) => {
          // Stack from the ground up, the way a yard fills.
          const row = Math.floor(i / cols)
          const on = i < whole
          const part = i === whole ? filled - whole : 0
          return (
            <rect
              key={i}
              x={(i % cols) * (w + gap)}
              y={height - (row + 1) * (h + gap) + gap}
              width={w}
              height={h}
              rx={h / 2}
              fill={on || part > 0.05 ? color : 'var(--color-rule)'}
              fillOpacity={on ? 1 : part > 0.05 ? 0.3 + 0.7 * part : 0.75}
            />
          )
        })}
      </svg>
    </div>
  )
}
