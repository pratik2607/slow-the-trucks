// Job 3, "Match the sets": a parent item needs its child items in the right ratio.
//
// For every set, godown and month this works out how many parents could actually be fitted out
// with the parts sent alongside them, how many are left waiting, and which part is holding them
// up. A part shared by several sets (G.I. nuts and bolts) is split between them in proportion to
// what each needs.
//
// What is compared (see `Lens`): by default, everything sent to the godown so far. Sets are used
// up in their ratio, so if a district has been sent 10,000 clamps and hooks for only 9,700, then
// 300 clamps have no hook, whether they are on the shelf or already with a contractor. Counting
// only the shelf would miss that, because parts are often issued to contractors in bulk.

import { godownLedger } from './ledger'
import type { Project } from './types'

/**
 * Which ratio to hold a set to.
 * 'usage'  - parts the site actually used per parent, over the whole project
 * 'lumino' - the ratio in Lumino's sheet, exactly as given
 * The two disagree for most parts. Lumino's own note says to ask before relying on its ratio.
 */
export type RatioBasis = 'usage' | 'lumino'

/**
 * 'supplied' - everything sent to the godown so far, net of transfers to other stores
 * 'shelf'    - only what is in the godown at the month end
 */
export type Lens = 'supplied' | 'shelf'

export interface SetPart {
  child: string
  /** Lumino's ratio, exactly as given. */
  lumino: number
  /** Part units the site used per parent unit over the whole project. Null if no parent was used. */
  observed: number | null
  /** The ratio in force for the check. */
  ratio: number
  /** True when more than one set needs this part. */
  shared: boolean
}

export interface SetDef {
  setNo: string
  parent: string
  parts: SetPart[]
}

/** A part covering less than this share of the parents beside it leaves the set short. */
export const SHORT_BELOW = 0.9
/** A part covering more than this many times the parents beside it is lying in surplus. */
export const SURPLUS_ABOVE = 1.5

export type Status = 'empty' | 'ok' | 'short' | 'surplus'

export interface PartBalance {
  child: string
  /** How much of the part is being counted in this godown. */
  have: number
  /** Of that, the share available to this set once other sets using the same part are served. */
  available: number
  /** What the parents in stock need. */
  need: number
  /** available / need. Null when no parents are in stock. */
  coverage: number | null
  missing: number
  status: Status
}

export interface SetBalance {
  parentStock: number
  /** Parents that could be fitted out with the parts on hand. */
  complete: number
  /** Parents left waiting for a part. */
  stranded: number
  /** The part that limits how many can be fitted out. */
  limiting: string | null
  parts: PartBalance[]
  status: Status
}

export interface SetsCheck {
  defs: SetDef[]
  /** [set][godown][month] */
  balance: SetBalance[][][]
  /**
   * [set][month] the same check with the six godowns treated as one store. A godown that is short
   * while this is not can be put right by a transfer; if this is short too, only an order will do.
   */
  pooled: SetBalance[][]
  /** [set][month], the six godowns added up. */
  parents: number[][]
  complete: number[][]
  stranded: number[][]
  /** [set] godown-months in each state, counting only months with something in stock. */
  counts: Record<Status, number>[]
}

const key = (parent: string, child: string) => `${parent}:${child}`
const EPS = 1e-9

export function setDefs(project: Project, basis: RatioBasis, overrides: Record<string, number> = {}): SetDef[] {
  const used = (code: string) => project.flows[code].use.reduce((a, b) => a + b, 0)

  // A part used by several sets has one usage figure, not one per set. Its usage is split between
  // the sets in the proportions Lumino gave, so the pieces add back up to what the site used.
  const weightedParents = new Map<string, number>()
  for (const line of project.sets) {
    weightedParents.set(line.child, (weightedParents.get(line.child) ?? 0) + line.ratio * used(line.parent))
  }
  const parentsOf = (child: string) => project.sets.filter((line) => line.child === child).length

  const defs: SetDef[] = []
  for (const line of project.sets) {
    let def = defs.find((d) => d.parent === line.parent)
    if (!def) {
      def = { setNo: line.setNo, parent: line.parent, parts: [] }
      defs.push(def)
    }
    const parentUsed = used(line.parent)
    const weighted = weightedParents.get(line.child) ?? 0
    const observed =
      parentsOf(line.child) > 1
        ? weighted > 0
          ? (used(line.child) / weighted) * line.ratio
          : null
        : parentUsed > 0
          ? used(line.child) / parentUsed
          : null
    const chosen = basis === 'usage' ? (observed ?? line.ratio) : line.ratio
    def.parts.push({
      child: line.child,
      lumino: line.ratio,
      observed,
      ratio: overrides[key(line.parent, line.child)] ?? chosen,
      shared: parentsOf(line.child) > 1,
    })
  }
  return defs
}

export const ratioKey = key

/** The balance of one set in one godown in one month, given stocks and what other sets need. */
export function balanceOf(
  parentStock: number,
  parts: { child: string; ratio: number; have: number; needElsewhere: number }[],
): SetBalance {
  let complete = parentStock
  let limiting: string | null = null
  const out: PartBalance[] = parts.map((p) => {
    const need = p.ratio * parentStock
    const needAll = need + p.needElsewhere
    const available = needAll > EPS ? p.have * (need / needAll) : 0
    const coverage = need > EPS ? available / need : null
    let status: Status = 'ok'
    if (coverage === null) status = p.have > EPS && needAll <= EPS ? 'surplus' : 'ok'
    else if (coverage < SHORT_BELOW) status = 'short'
    else if (coverage > SURPLUS_ABOVE) status = 'surplus'
    if (p.ratio > EPS && parentStock > EPS) {
      const fitOut = available / p.ratio
      if (fitOut < complete) {
        complete = fitOut
        limiting = p.child
      }
    }
    return { child: p.child, have: p.have, available, need, coverage, missing: Math.max(0, need - available), status }
  })
  complete = Math.max(0, Math.min(parentStock, complete))
  const nothing = parentStock <= EPS && out.every((p) => p.have <= EPS)
  const status: Status = nothing
    ? 'empty'
    : out.some((p) => p.status === 'short')
      ? 'short'
      : out.some((p) => p.status === 'surplus')
        ? 'surplus'
        : 'ok'
  return { parentStock, complete, stranded: Math.max(0, parentStock - complete), limiting, parts: out, status }
}

export function checkSets(
  project: Project,
  basis: RatioBasis,
  overrides: Record<string, number> = {},
  lens: Lens = 'supplied',
): SetsCheck {
  const N = project.meta.months.length
  const G = project.meta.godowns.length
  const defs = setDefs(project, basis, overrides)

  const cache = new Map<string, number[][]>()
  const stockOf = (code: string): number[][] => {
    let s = cache.get(code)
    if (!s) {
      s = project.flows[code].g.map((g) => {
        if (lens === 'shelf') return godownLedger(g).closing
        let sent = 0
        return g.rec.map((_, m) => Math.max(0, (sent += g.rec[m] + g.tin[m] - g.tout[m] - g.close[m])))
      })
      cache.set(code, s)
    }
    return s
  }

  // What every set together needs of each part, per godown and month.
  const needAll = new Map<string, number[][]>()
  for (const def of defs) {
    const parent = stockOf(def.parent)
    for (const part of def.parts) {
      let table = needAll.get(part.child)
      if (!table) {
        table = Array.from({ length: G }, () => new Array<number>(N).fill(0))
        needAll.set(part.child, table)
      }
      for (let g = 0; g < G; g++) for (let m = 0; m < N; m++) table[g][m] += part.ratio * parent[g][m]
    }
  }

  const balance = defs.map((def) => {
    const parent = stockOf(def.parent)
    return Array.from({ length: G }, (_, g) =>
      Array.from({ length: N }, (_, m) =>
        balanceOf(
          parent[g][m],
          def.parts.map((part) => ({
            child: part.child,
            ratio: part.ratio,
            have: stockOf(part.child)[g][m],
            needElsewhere: needAll.get(part.child)![g][m] - part.ratio * parent[g][m],
          })),
        ),
      ),
    )
  })

  const total = (table: number[][], m: number) => table.reduce((s, g) => s + g[m], 0)
  const pooled = defs.map((def) =>
    Array.from({ length: N }, (_, m) => {
      const parents = total(stockOf(def.parent), m)
      return balanceOf(
        parents,
        def.parts.map((part) => ({
          child: part.child,
          ratio: part.ratio,
          have: total(stockOf(part.child), m),
          needElsewhere: total(needAll.get(part.child)!, m) - part.ratio * parents,
        })),
      )
    }),
  )

  const summed = (pick: (b: SetBalance) => number) =>
    balance.map((byGodown) => Array.from({ length: N }, (_, m) => byGodown.reduce((s, months) => s + pick(months[m]), 0)))

  const counts = balance.map((byGodown) => {
    const c: Record<Status, number> = { empty: 0, ok: 0, short: 0, surplus: 0 }
    for (const months of byGodown) for (const b of months) c[b.status]++
    return c
  })

  return {
    defs,
    balance,
    pooled,
    parents: summed((b) => b.parentStock),
    complete: summed((b) => b.complete),
    stranded: summed((b) => b.stranded),
    counts,
  }
}

/** What a godown-month needs: nothing, a transfer, an order, or it simply holds parts ahead of parents. */
export type Remedy = 'empty' | 'ok' | 'move' | 'order' | 'surplus'

/** A short godown is a transfer problem if the project as a whole has the part, an order problem if not. */
export function remedyOf(check: SetsCheck, set: number, godown: number, month: number): Remedy {
  const b = check.balance[set][godown][month]
  if (b.status !== 'short') return b.status
  const shortHere = b.parts.filter((p) => p.status === 'short').map((p) => p.child)
  const shortEverywhere = check.pooled[set][month].parts.some((p) => shortHere.includes(p.child) && p.status === 'short')
  return shortEverywhere ? 'order' : 'move'
}
