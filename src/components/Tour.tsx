// A short guided tour: one step at a time, the thing being described lit up and the rest dimmed.

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

export interface TourStep {
  /** A CSS selector for the part of the page this step is about. */
  target: string
  title: string
  body: string
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const CARD_WIDTH = 352

export function Tour({ steps, onClose }: { steps: readonly TourStep[]; onClose: () => void }) {
  const [at, setAt] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = steps[at]
  const isLast = at === steps.length - 1

  const measure = useCallback(() => {
    const el = document.querySelector(step.target)
    if (!el) return setBox(null)
    const r = el.getBoundingClientRect()
    // A tall block is lit only from its top, so the note beside it always fits on screen.
    setBox({ x: r.left - 8, y: r.top - 8, w: r.width + 16, h: Math.min(r.height, window.innerHeight * 0.45) + 16 })
  }, [step.target])

  // Bring the part into view near the top, leaving room for the note under it.
  useLayoutEffect(() => {
    const el = document.querySelector(step.target)
    if (el) window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - 120) })
    measure()
  }, [step.target, measure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setAt((i) => Math.min(i + 1, steps.length - 1))
      else if (e.key === 'ArrowLeft') setAt((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [measure, onClose, steps.length])

  const left = box ? Math.max(16, Math.min(box.x, window.innerWidth - CARD_WIDTH - 16)) : 0
  const below = box ? box.y + box.h + 12 + 230 < window.innerHeight : false
  const place = !box
    ? { left: '50%', top: '40%', transform: 'translate(-50%, -50%)' }
    : below
      ? { left, top: box.y + box.h + 12 }
      : { left, bottom: Math.max(16, window.innerHeight - box.y + 12) }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="A short tour of this page">
      {box ? (
        // The lit area. Its very large shadow is what dims the rest of the page. It has its own key so it
        // appears in place on the first step and only glides between steps after that.
        <div key="lit" className="pointer-events-none absolute rounded-2xl transition-all duration-300" style={{ left: box.x, top: box.y, width: box.w, height: box.h, boxShadow: '0 0 0 200vmax rgba(23, 32, 43, 0.62)' }} />
      ) : (
        <div key="dim" className="absolute inset-0" style={{ background: 'rgba(23, 32, 43, 0.62)' }} />
      )}
      <div className="absolute rounded-2xl bg-panel p-5 shadow-[0_18px_50px_rgba(23,32,43,0.35)]" style={{ width: `min(${CARD_WIDTH}px, calc(100vw - 2rem))`, ...place }}>
        <div className="text-[12px] text-muted">
          {at + 1} of {steps.length}
        </div>
        <div className="wide mt-1 text-[17px] font-extrabold leading-snug">{step.title}</div>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onClose} className="mr-auto text-[13.5px] text-muted hover:text-ink">
            Skip
          </button>
          {at > 0 && (
            <button type="button" onClick={() => setAt(at - 1)} className="rounded-xl border border-rule px-3.5 py-2 text-[13.5px] font-semibold">
              Back
            </button>
          )}
          <button type="button" autoFocus onClick={() => (isLast ? onClose() : setAt(at + 1))} className="rounded-xl bg-ink px-4 py-2 text-[13.5px] font-semibold text-panel">
            {isLast ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
