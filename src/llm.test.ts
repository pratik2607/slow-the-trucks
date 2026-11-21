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
    // the Overview's own figure for the service cable
    expect(text).toContain('Average idle so far: 2,77,517 actual, 90,563 plan (67% less)')
    // the ranking is worked out for the model, not left to it
    expect(text).toContain('biggest gain first: 1. Service cable, 1×25 sq mm (67% less); 2. Ring lug, 25 sq mm (61% less)')
    expect(text).toContain('Items the site has had to wait for under the plan so far: none.')
  })

  it('never holds a month after the cut-off', () => {
    for (const cutoff of [4, 20, 31]) {
      const text = buildContext(run, cutoff)
      expect(text).toContain(monthLabel(months[cutoff]))
      for (let m = cutoff + 1; m < months.length; m++) expect(text).not.toContain(monthLabel(months[m]))
    }
  })
})
