import { describe, expect, it } from 'vitest'
import { project } from '../data'
import { balanceOf, checkSets, ratioKey, setDefs } from './sets'

const POLE_CLAMP = 'MRP070060'
const EYE_HOOK = 'MEH050071'
const THREE_PHASE = 'MRP070065'
const RING_LUG = 'MLU020008'
const SHARED_BOLTS = 'MNB010174'

describe('one set in one godown', () => {
  it('fits out only as many parents as the scarcest part allows', () => {
    const b = balanceOf(100, [
      { child: 'hook', ratio: 1, have: 60, needElsewhere: 0 },
      { child: 'bolt', ratio: 2, have: 300, needElsewhere: 0 },
    ])
    expect(b.complete).toBe(60)
    expect(b.stranded).toBe(40)
    expect(b.limiting).toBe('hook')
    expect(b.status).toBe('short')
    expect(b.parts[0].missing).toBe(40)
    expect(b.parts[1].status).toBe('ok')
  })

  it('calls a set balanced when every part is close to what the parents need', () => {
    const b = balanceOf(100, [{ child: 'hook', ratio: 1, have: 95, needElsewhere: 0 }])
    expect(b.status).toBe('ok')
    expect(b.stranded).toBe(5)
  })

  it('flags parts lying about with no parent to go on', () => {
    expect(balanceOf(0, [{ child: 'hook', ratio: 1, have: 500, needElsewhere: 0 }]).status).toBe('surplus')
    expect(balanceOf(100, [{ child: 'hook', ratio: 1, have: 500, needElsewhere: 0 }]).status).toBe('surplus')
    expect(balanceOf(0, [{ child: 'hook', ratio: 1, have: 0, needElsewhere: 0 }]).status).toBe('empty')
  })

  it('shares a common part between sets in proportion to what each needs', () => {
    // This set needs 100 of the part, another set needs 300, and there are only 200.
    const b = balanceOf(100, [{ child: 'bolt', ratio: 1, have: 200, needElsewhere: 300 }])
    expect(b.parts[0].available).toBe(50)
    expect(b.complete).toBe(50)
    expect(b.status).toBe('short')
  })
})

describe("Lumino's three sets", () => {
  it('reads the sets as given: one of four parts, two of two parts', () => {
    const defs = setDefs(project, 'lumino')
    expect(defs.map((d) => d.parts.length)).toEqual([4, 2, 2])
    expect(defs[0].parent).toBe(POLE_CLAMP)
    expect(defs.every((d) => d.parts.some((p) => p.child === SHARED_BOLTS))).toBe(true)
  })

  it("finds that Lumino's ratio matches real usage only for the eye hook", () => {
    const defs = setDefs(project, 'usage')
    const hook = defs[0].parts.find((p) => p.child === EYE_HOOK)!
    expect(hook.lumino).toBe(1)
    expect(hook.observed).toBeCloseTo(0.951, 2)
    const lug = defs.find((d) => d.parent === THREE_PHASE)!.parts.find((p) => p.child === RING_LUG)!
    expect(lug.lumino).toBe(0.25)
    expect(lug.observed).toBeCloseTo(5.657, 2)
    expect(lug.shared).toBe(false)
    const agree = defs.flatMap((d) => d.parts).filter((p) => p.observed !== null && Math.abs(p.observed - p.lumino) / p.lumino < 0.2)
    expect(agree.map((p) => p.child)).toEqual([EYE_HOOK])
  })

  it('splits the shared bolts between the three sets so the pieces add up to what was used', () => {
    const defs = setDefs(project, 'usage')
    const used = (code: string) => project.flows[code].use.reduce((a, b) => a + b, 0)
    const rebuilt = defs.reduce((s, d) => s + d.parts.find((p) => p.child === SHARED_BOLTS)!.observed! * used(d.parent), 0)
    expect(rebuilt).toBeCloseTo(used(SHARED_BOLTS), 3)
    expect(defs.every((d) => d.parts.find((p) => p.child === SHARED_BOLTS)!.shared)).toBe(true)
  })

  it('tells a shortfall a transfer can fix from one only an order can fix', () => {
    const check = checkSets(project, 'usage')
    check.balance.forEach((set, si) => {
      set[0].forEach((_, m) => {
        const inGodowns = set.reduce((s, g) => s + g[m].stranded, 0)
        // Pooling the godowns can only help: it never leaves more parents waiting.
        expect(check.pooled[si][m].stranded).toBeLessThanOrEqual(inGodowns + 1e-6)
      })
    })
  })

  it('lets a ratio be typed in over either basis', () => {
    const defs = setDefs(project, 'lumino', { [ratioKey(THREE_PHASE, RING_LUG)]: 6 })
    expect(defs.find((d) => d.parent === THREE_PHASE)!.parts.find((p) => p.child === RING_LUG)!.ratio).toBe(6)
  })

  it('never fits out more parents than are in stock, in any godown or month', () => {
    const check = checkSets(project, 'usage')
    for (const set of check.balance) {
      for (const godown of set) {
        for (const b of godown) {
          expect(b.complete).toBeLessThanOrEqual(b.parentStock + 1e-6)
          expect(b.stranded).toBeGreaterThanOrEqual(0)
          expect(b.complete + b.stranded).toBeCloseTo(b.parentStock, 4)
        }
      }
    }
  })

  it('never hands out more of the shared bolts than a godown holds', () => {
    const check = checkSets(project, 'usage')
    const G = project.meta.godowns.length
    const N = project.meta.months.length
    for (let g = 0; g < G; g++) {
      for (let m = 0; m < N; m++) {
        const parts = check.balance.map((set) => set[g][m].parts.find((p) => p.child === SHARED_BOLTS)!)
        const handedOut = parts.reduce((s, p) => s + p.available, 0)
        expect(handedOut).toBeLessThanOrEqual(parts[0].have + 1e-6)
      }
    }
  })

  it('accounts for every godown-month of every set', () => {
    const check = checkSets(project, 'usage')
    for (const c of check.counts) expect(c.empty + c.ok + c.short + c.surplus).toBe(6 * 44)
  })
})
