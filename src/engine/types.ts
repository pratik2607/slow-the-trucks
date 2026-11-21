export type Role = 'Independent' | 'Parent' | 'Child'

export interface Item {
  code: string
  name: string
  /** The one unit this item is counted in everywhere (PCS, NOS, KG, MT, KM, MTR, SET). */
  unit: string
  /** Days from placing an order to the material arriving. */
  leadDays: number
  role: Role
}

export interface Godown {
  code: string
  name: string
}

/** Monthly quantities for one item in one godown. Every array has one entry per project month. */
export interface GodownFlows {
  /** Received from vendors. */
  rec: number[]
  /** Number of receipts (goods receipt notes) - roughly, trucks. */
  recN: number[]
  /** Transferred in from another store. */
  tin: number[]
  /** Transferred out to another store. */
  tout: number[]
  /** Sent to the closing store when the project wound up. */
  close: number[]
  /** Issued to contractors. */
  iss: number[]
  /** Returned by contractors. */
  ret: number[]
}

export interface ItemFlows {
  /** Used at site. Lumino records this for the whole project, not per godown. */
  use: number[]
  /** One entry per godown, in the order of `meta.godowns`. */
  g: GodownFlows[]
}

export interface SetLine {
  setNo: string
  parent: string
  child: string
  /** Lumino's own ratio for this child against its parent, exactly as given. */
  ratio: number
}

export interface Project {
  meta: {
    project: string
    /** "2023-03" .. "2026-10" */
    months: string[]
    godowns: Godown[]
    closingStore: string
    sourceRows: { receipts: number; contractorMoves: number; transfers: number }
    skipped: Record<string, number>
    closingStoreIn: Record<string, number>
  }
  items: Item[]
  sets: SetLine[]
  flows: Record<string, ItemFlows>
}
