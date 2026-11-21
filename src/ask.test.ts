import { describe, expect, it } from 'vitest'
import { ask, findItem, findMonth, HELP, NOUNS } from './ask'
import { DEFAULT_SETTINGS } from './engine/planner'
import { months, replay } from './model'

const run = replay(DEFAULT_SETTINGS)
const POLE = 'MPO010014'
const ctx = { item: POLE, month: months.indexOf('2025-02'), cutoff: months.length - 1 }

describe('reading a question', () => {
  it('tells similar item names apart', () => {
    expect(findItem('how many poles were idle')).toBe(POLE)
    expect(findItem('pole clamp sets in nagar')).toBe('MRP070060')
    expect(findItem('ring lug stock')).toBe('MLU020008')
    expect(findItem('how many lugs')).toBe('MLU020013')
    expect(findItem('what is the weather')).toBeNull()
  })

  it('reads back every item the way the app itself names it', () => {
    for (const [code, noun] of Object.entries(NOUNS)) expect(findItem(noun.toLowerCase()), noun).toBe(code)
  })

  it('reads a month however it is written', () => {
    expect(months[findMonth('in feb 2025', '2024')!]).toBe('2025-02')
    expect(months[findMonth('in march 24', '2025')!]).toBe('2024-03')
    expect(months[findMonth('for 2023-12', '2025')!]).toBe('2023-12')
    expect(months[findMonth('what about june', '2024')!]).toBe('2024-06')
    expect(findMonth('no month here', '2024')).toBeNull()
  })
})

describe('answering from the records', () => {
  it('gives the idle stock the records show', () => {
    const a = ask('How many poles were lying idle in Feb 2025?', ctx, run)
    expect(a.understood).toBe(true)
    expect(a.text).toContain('48,991')
    expect(a.text).toContain('35,496 in godowns')
  })

  it("gives the planner's call with its reason", () => {
    const a = ask('What should we order for poles in March 2024?', ctx, run)
    expect(a.text).toMatch(/order|hold/)
    expect(a.about).toEqual({ item: POLE, month: months.indexOf('2024-03') })
  })

  it('finds the worst month', () => {
    const a = ask('When was the worst month for poles?', ctx, run)
    expect(a.text).toContain('48,991')
    expect(a.text).toContain('Feb 2025')
  })

  it('says what the plan saves, overall and for one item', () => {
    expect(ask('How much does the plan save overall?', ctx, run).text).toContain('never waits')
    expect(ask('How much does the plan save on ring lugs?', ctx, run).text).toContain('Ring lug')
  })

  it('keeps the item in view when a follow-up names only a month', () => {
    const a = ask('and in June 2024?', ctx, run)
    expect(a.about).toEqual({ item: POLE, month: months.indexOf('2024-06') })
  })

  it('answers about a godown, deliveries, usage, lead time and sets', () => {
    expect(ask('How many poles were in Nagar in Feb 2025?', ctx, run).text).toContain('Nagar godown held')
    expect(ask('How many poles arrived in Feb 2025?', ctx, run).text).toContain('6,966')
    expect(ask('How many poles did the site use in Feb 2025?', ctx, run).text).toContain('1,859')
    expect(ask('What is the lead time for poles?', ctx, run).text).toContain('150 days')
    expect(ask('Which sets are out of balance in Feb 2025?', ctx, run).see?.screen).toBe('sets')
  })

  it('answers every suggested question for every item', () => {
    for (const noun of Object.values(NOUNS)) {
      for (const question of [`${noun} lying idle in Feb 2025?`, `What should we order for ${noun} in Feb 2025?`, `Worst month for ${noun}?`]) {
        const a = ask(question, ctx, run)
        expect(a.understood, question).toBe(true)
        expect(a.see?.screen, question).toBe('item')
      }
    }
  })

  it('says so when it does not understand, and never makes something up', () => {
    const a = ask('Who won the cricket yesterday?', ctx, run)
    expect(a.understood).toBe(false)
    expect(a.text).toBe(HELP)
  })

  describe('with a cut-off month', () => {
    const june24 = months.indexOf('2024-06')
    const early = { item: POLE, month: june24, cutoff: june24 }

    it('declines a question about a month after the cut-off', () => {
      const a = ask('How many poles were lying idle in Feb 2025?', early, run)
      expect(a.beyond).toBe(true)
      expect(a.text).toContain('My records stop at the end of Jun 2024')
      expect(a.text).not.toContain('48,991')
    })

    it('answers about months up to the cut-off exactly as before', () => {
      const full = ask('How many poles were lying idle in Mar 2024?', ctx, run)
      const cut = ask('How many poles were lying idle in Mar 2024?', early, run)
      expect(cut.text).toBe(full.text)
    })

    it('stops totals, averages and the worst month at the cut-off', () => {
      const worst = ask('When was the worst month for poles?', early, run)
      expect(worst.text).toContain('Up to Jun 2024')
      expect(worst.text).not.toContain('2025')
      const used = ask('How many poles did the site use?', early, run)
      const usedAll = ask('How many poles did the site use in Jun 2024?', ctx, run)
      expect(used.text).toContain('Up to Jun 2024')
      expect(used.text).not.toBe(usedAll.text)
    })

    it('never lets the month in view run past the cut-off', () => {
      const a = ask('How many poles are lying idle?', { item: POLE, month: months.length - 1, cutoff: june24 }, run)
      expect(a.about?.month).toBe(june24)
    })

    it('sees more when the cut-off moves forward', () => {
      const later = { ...early, cutoff: months.indexOf('2025-02') }
      expect(ask('How many poles were lying idle in Feb 2025?', later, run).text).toContain('48,991')
    })
  })
})
