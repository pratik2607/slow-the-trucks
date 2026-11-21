import { describe, expect, it } from 'vitest'
import { project } from '../data'
import { godownLedger, itemLedger, sum, summarise, trailingMean } from './ledger'
import type { GodownFlows } from './types'

const POLE = 'MPO010014'

describe('godown stock sum', () => {
  it('follows receipts + transfers in - transfers out - issues + returns, from zero', () => {
    const f: GodownFlows = {
      rec: [100, 50, 0],
      recN: [1, 1, 0],
      tin: [0, 10, 0],
      tout: [0, 0, 20],
      close: [0, 0, 5],
      iss: [30, 60, 40],
      ret: [0, 5, 10],
    }
    const l = godownLedger(f)
    expect(l.closing).toEqual([70, 75, 20])
    expect(l.opening).toEqual([0, 70, 75])
  })

  it('reads a late-entry dip as zero without losing the late entry', () => {
    const f: GodownFlows = {
      rec: [0, 10, 0],
      recN: [0, 1, 0],
      tin: [0, 0, 0],
      tout: [0, 0, 0],
      close: [0, 0, 0],
      iss: [10, 0, 0],
      ret: [0, 0, 0],
    }
    const l = godownLedger(f)
    expect(l.raw).toEqual([-10, 0, 0])
    expect(l.closing).toEqual([0, 0, 0])
  })
})

describe('trailing mean', () => {
  it('never reaches back before the first active month', () => {
    expect(trailingMean([0, 0, 6, 12], 3, 6, 2)).toBe(9)
    expect(trailingMean([4, 4, 4, 4, 4, 4, 10], 6, 6)).toBe(5)
  })
})

describe('the real project', () => {
  it('has 44 months, 16 items and 6 godowns', () => {
    expect(project.meta.months).toHaveLength(44)
    expect(project.meta.months[0]).toBe('2023-03')
    expect(project.meta.months.at(-1)).toBe('2026-10')
    expect(project.items).toHaveLength(16)
    expect(project.meta.godowns.map((g) => g.code)).toEqual(['KAN01', 'KAN02', 'KAN03', 'KAN04', 'KAN05', 'KAN06'])
  })

  it('reconciles every item: what came in equals what went out plus what is left', () => {
    for (const item of project.items) {
      const l = itemLedger(project, item.code)
      l.godowns.forEach((g) => {
        const expected = sum(g.rec) + sum(g.tin) - sum(g.tout) - sum(g.close) - sum(g.iss) + sum(g.ret)
        expect(g.raw.at(-1)).toBeCloseTo(expected, 3)
      })
      const heldByContractors = sum(l.issued) - sum(l.returned) - sum(l.used)
      expect(l.withContractors.at(-1)).toBeCloseTo(Math.max(0, heldByContractors), 3)
    }
  })

  // These figures were worked out independently with a separate script before any app code existed.
  it('matches the independently computed pole numbers', () => {
    const l = itemLedger(project, POLE)
    const s = summarise(l)
    expect(s.received).toBe(117050)
    expect(s.used).toBe(104871)
    expect(sum(l.issued)).toBe(127304)
    expect(sum(l.returned)).toBe(17039)
    expect(s.endInGodowns).toBe(5006)
    expect(s.endWithContractors).toBe(5394)
    expect(s.peakIdle).toBe(48991)
    expect(l.months[s.peakIdleMonth]).toBe('2025-02')
    expect(l.inGodowns[s.peakIdleMonth]).toBe(35496)
    expect(l.withContractors[s.peakIdleMonth]).toBe(13495)
  })

  it('keeps idle stock as godown stock plus contractor stock in every month', () => {
    for (const item of project.items) {
      const l = itemLedger(project, item.code)
      l.idle.forEach((x, m) => expect(x).toBeCloseTo(l.inGodowns[m] + l.withContractors[m], 3))
    }
  })
})
