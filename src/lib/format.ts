import type { Item } from '../engine/types'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2025-02" -> "Feb 2025" */
export const monthLabel = (ym: string): string => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

const grouped = (digits: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits })
const F0 = grouped(0)
const F1 = grouped(1)
const F2 = grouped(2)
const F3 = grouped(3)

/** A quantity with Indian digit grouping. Small numbers (tonnes, kilometres) keep their decimals. */
export function qty(x: number): string {
  const a = Math.abs(x)
  if (a < 0.0005) return '0'
  if (a >= 100) return F0.format(x)
  if (a >= 10) return F1.format(x)
  if (a >= 1) return F2.format(x)
  return F3.format(x)
}

const COMPACT = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 })

/** Short form for axis ticks: 35K, 1.2L, 3Cr. */
export const compact = (x: number): string => (Math.abs(x) < 1000 ? qty(x) : COMPACT.format(x))

/** Rupees in lakh and crore, the way the numbers are spoken. */
export function rupees(x: number): string {
  const a = Math.abs(x)
  if (a >= 1e7) return `₹${(a >= 1e8 ? F1 : F2).format(x / 1e7)} crore`
  if (a >= 1e5) return `₹${F1.format(x / 1e5)} lakh`
  return `₹${F0.format(x)}`
}

/** Months of cover, one decimal. */
export const cover = (x: number | null): string => (x === null ? 'no usage' : x >= 100 ? '99+' : F1.format(x))

export const percent = (x: number): string => `${F0.format(x * 100)}%`

const UNIT_WORDS: Record<string, string> = {
  PCS: 'pcs',
  NOS: 'nos',
  KG: 'kg',
  MT: 'tonnes',
  KM: 'km',
  MTR: 'm',
  SET: 'sets',
}
export const unitWord = (unit: string): string => UNIT_WORDS[unit] ?? unit.toLowerCase()

// Lumino's item names are written for an ERP. These are the same items in plain words.
const SHORT_NAMES: Record<string, string> = {
  MPO010014: 'PCC pole, 8.5 m',
  MCA020009: 'Aerial bunched cable',
  MRP070022: 'Service cable, 1×25 sq mm',
  MCA090005: 'Suspension clamp',
  MCO010007: 'Wedge connector',
  MEH050075: 'Dead end clamp',
  MRP070059: 'Piercing connector',
  MRP070060: 'Pole clamp set',
  MRP070064: 'Single phase box',
  MRP070065: 'Three phase box',
  MEH050071: 'Eye hook',
  MLU020008: 'Ring lug, 25 sq mm',
  MLU020013: 'Lug, 25 sq mm',
  MNB010007: 'Hex bolts and nuts',
  MNB010128: 'Galvanised bolts and nuts',
  MNB010174: 'G.I. nuts and bolts, M16',
}
export const shortName = (item: Item): string => SHORT_NAMES[item.code] ?? item.name

/** "KANPUR FARRUKHABAD" -> "Farrukhabad" */
export function godownShort(name: string): string {
  const bare = name.replace(/^KANPUR\s+/i, '')
  return bare.charAt(0) + bare.slice(1).toLowerCase()
}
