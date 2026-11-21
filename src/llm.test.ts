import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './engine/planner'
import { monthLabel } from './lib/format'
import { buildContext } from './llm'
import { months, replay } from './model'

const run = replay(DEFAULT_SETTINGS)

describe('what the language model is sent', () => {
  it('holds the same figures the screens show', () => {
    const text = buildContext(run, months.length - 1)
    expect(text).toContain('Worst month so far: Feb 2025, 48,991 actual, 18,978 plan')
    expect(text).toContain('Feb 2025 | ')
  })

  it('never holds a month after the cut-off', () => {
    for (const cutoff of [4, 20, 31]) {
      const text = buildContext(run, cutoff)
      expect(text).toContain(monthLabel(months[cutoff]))
      for (let m = cutoff + 1; m < months.length; m++) expect(text).not.toContain(monthLabel(months[m]))
    }
  })
})
