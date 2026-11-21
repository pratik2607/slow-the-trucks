// The app's own calculation behind Ask AI: plain questions about the data, answered in the browser.
//
// There is no language model in this file and no key. A question is matched to an item, a month, a
// godown and one of a dozen kinds of question, and the answer is worked out from Lumino's records
// and the replay on the spot. The Ask AI screen runs this first, then asks the language model
// (src/llm.ts): this answer declines anything past the cut-off before a model is asked, gives the
// model checked figures to build on, and is what is shown if the model cannot be reached.
//
// It also has a cut-off month. It answers as if that month were today: nothing after it exists,
// totals and averages stop there, and a question about a later month is declined. Moving the
// cut-off forward is the only way to let it see more.

import { remedyOf } from './engine/sets'
import { cover, godownShort, monthLabel, percent, qty, shortName, unitWord } from './lib/format'
import { godowns, ledgers, months, project, setsCheck, type Replay } from './model'
import { reason } from './views/parts/shared'

export type Screen = 'overview' | 'sheet' | 'item' | 'register' | 'sets'

export interface Context {
  item: string
  month: number
  /** The last month it is allowed to know about. */
  cutoff: number
}

export interface Answer {
  understood: boolean
  text: string
  /** True when the question was clear but asked about something after the cut-off. */
  beyond?: boolean
  /** The item and month the answer is about, so a follow-up question can leave them out. */
  about?: { item?: string; month?: number }
  /** Where to see the same thing in the app. */
  see?: { screen: Screen; label: string }
}

// Longest names first, so "pole clamp" is not read as "pole" and "ring lug" not as "lug".
const NAMES: [string, string][] = (
  [
    ['pole clamp', 'MRP070060'], ['clamp set', 'MRP070060'], ['rdss', 'MRP070060'],
    ['pcc', 'MPO010014'], ['poles', 'MPO010014'], ['pole', 'MPO010014'],
    ['aerial bunched', 'MCA020009'], ['aerial', 'MCA020009'], ['bunched', 'MCA020009'], ['ab cable', 'MCA020009'],
    ['service cable', 'MRP070022'], ['1x25', 'MRP070022'], ['1×25', 'MRP070022'], ['unarmoured', 'MRP070022'],
    ['suspension clamp', 'MCA090005'], ['suspension', 'MCA090005'],
    ['wedge connector', 'MCO010007'], ['wedge', 'MCO010007'], ['pg clamp', 'MCO010007'],
    ['dead end clamp', 'MEH050075'], ['dead end', 'MEH050075'], ['dead-end', 'MEH050075'],
    ['piercing connector', 'MRP070059'], ['piercing', 'MRP070059'],
    ['single phase', 'MRP070064'], ['single-phase', 'MRP070064'],
    ['three phase', 'MRP070065'], ['three-phase', 'MRP070065'], ['3 phase', 'MRP070065'],
    ['eye hook', 'MEH050071'], ['hook', 'MEH050071'],
    ['ring lug', 'MLU020008'], ['ring type', 'MLU020008'], ['lugs', 'MLU020013'], ['lug', 'MLU020013'],
    ['hex bolt', 'MNB010007'], ['hex', 'MNB010007'],
    ['galvanised', 'MNB010128'], ['galvanized', 'MNB010128'],
    ['g.i.', 'MNB010174'], ['gi nuts', 'MNB010174'], ['m16', 'MNB010174'], ['nuts and bolts', 'MNB010174'],
    ['cable', 'MCA020009'],
  ] as [string, string][]
).sort((a, b) => b[0].length - a[0].length)

/** How each item is said in a sentence. Every one of these is also read back correctly by `findItem`. */
export const NOUNS: Record<string, string> = {
  MPO010014: 'poles',
  MCA020009: 'aerial cable',
  MRP070022: 'service cable',
  MCA090005: 'suspension clamps',
  MCO010007: 'wedge connectors',
  MEH050075: 'dead end clamps',
  MRP070059: 'piercing connectors',
  MRP070060: 'pole clamps',
  MRP070064: 'single phase boxes',
  MRP070065: 'three phase boxes',
  MEH050071: 'eye hooks',
  MLU020008: 'ring lugs',
  MLU020013: 'lugs',
  MNB010007: 'hex bolts',
  MNB010128: 'galvanised bolts',
  MNB010174: 'G.I. nuts and bolts',
}

const MONTH_WORDS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function findItem(q: string): string | null {
  for (const [name, code] of NAMES) if (q.includes(name)) return code
  return null
}

/** A month named in the question: "Feb 2025", "february 25", "2025-02". A bare "march" takes the year in view. */
export function findMonth(q: string, yearInView: string): number | null {
  const iso = q.match(/\b(20\d{2})-(\d{2})\b/)
  if (iso) {
    const i = months.indexOf(`${iso[1]}-${iso[2]}`)
    if (i >= 0) return i
  }
  const named = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s*'?(20\d{2}|\d{2})?\b/)
  if (!named) return null
  const mm = String(MONTH_WORDS.indexOf(named[1]) + 1).padStart(2, '0')
  const year = named[2] ? (named[2].length === 2 ? `20${named[2]}` : named[2]) : yearInView
  const exact = months.indexOf(`${year}-${mm}`)
  if (exact >= 0) return exact
  const any = months.findIndex((ym) => ym.endsWith(`-${mm}`))
  return any >= 0 ? any : null
}

export function findGodown(q: string): number | null {
  const i = godowns.findIndex((g) => q.includes(godownShort(g.name).toLowerCase()))
  return i >= 0 ? i : null
}

const has = (q: string, pattern: RegExp) => pattern.test(q)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2
}
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

export const HELP =
  'I can answer from the records: how much of an item was lying idle in a month, what the planner says to order, what arrived, what the site used, the worst month, lead times, what the plan saves, which items are held longest, and which sets are out of balance. Name an item and a month, or try a suggestion.'

export function ask(question: string, ctx: Context, run: Replay): Answer {
  const q = ` ${question.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, ' ')} `
  const last = months.length - 1
  const cutoff = Math.min(last, Math.max(0, ctx.cutoff))
  const N = cutoff + 1
  const whole = cutoff === last
  const until = monthLabel(months[cutoff])
  /** How a total or an average is introduced, so it is clear how far it reaches. */
  const scope = whole ? 'Over the whole project' : `Up to ${until}`

  const named = findItem(q)
  const code = named ?? ctx.item
  const asked = findMonth(q, months[Math.min(ctx.month, cutoff)].slice(0, 4))
  const g = findGodown(q)

  // Nothing after the cut-off exists for it.
  if (asked !== null && asked > cutoff) {
    return {
      understood: true,
      beyond: true,
      text: `My records stop at the end of ${until}. ${monthLabel(months[asked])} is after that, so I cannot say. Move the cut-off forward to let me see it.`,
    }
  }
  const m = asked ?? Math.min(ctx.month, cutoff)

  const item = project.items.find((i) => i.code === code)!
  const name = shortName(item)
  const unit = unitWord(item.unit)
  const when = monthLabel(months[m])
  const l = ledgers[code]
  const plan = run.plans[code]
  const about = { item: code, month: m }

  // Everything below is worked out from months 0..cutoff only.
  const upTo = (xs: readonly number[]) => xs.slice(0, N)
  const peakOf = (xs: readonly number[]) => upTo(xs).reduce((best, x, i, a) => (x > a[best] ? i : best), 0)
  const stats = (c: string) => {
    const p = run.plans[c]
    const real = sum(upTo(p.realIdle)) / N
    const ours = sum(upTo(p.idle)) / N
    const need = upTo(p.needTotal)
    const first = need.findIndex((x) => x > 0)
    const perMonth = first < 0 ? 0 : sum(need) / (need.findLastIndex((x) => x > 0) - first + 1)
    const waits = upTo(p.waiting)
    return {
      real,
      ours,
      cut: real > 0 ? 1 - ours / real : 0,
      waitMonths: waits.filter((w) => w > 1e-6).length,
      worstWait: Math.max(0, ...waits),
      onHandReal: perMonth > 0 ? real / perMonth : 0,
      onHandOurs: perMonth > 0 ? ours / perMonth : 0,
      peakReal: peakOf(p.realIdle),
      peakOurs: peakOf(p.idle),
    }
  }
  const mine = stats(code)

  // ---- sets ----------------------------------------------------------------------------------------
  if (has(q, /out of balance|balance|set check|which sets|sets are|fitted out|out of step/)) {
    const lines = setsCheck.defs.map((def, si) => {
      const pooled = setsCheck.pooled[si][m]
      const flagged = godowns.filter((_, gi) => ['move', 'order'].includes(remedyOf(setsCheck, si, gi, m))).length
      const setName = shortName(project.items.find((i) => i.code === def.parent)!)
      if (flagged === 0) return `${setName}: in balance in every godown.`
      const missing = pooled.parts.some((p) => p.status === 'short') && pooled.stranded >= 1
      return missing
        ? `${setName}: ${qty(Math.ceil(pooled.stranded))} cannot be fitted out across the project, so the missing part has to be ordered.`
        : `${setName}: out of step in ${flagged} of 6 godowns, but the parts exist elsewhere, so a transfer fixes it.`
    })
    return { understood: true, text: `Sets at the end of ${when}. ${lines.join(' ')}`, about: { month: m }, see: { screen: 'sets', label: 'Open the set check' } }
  }

  // ---- which items are held longest --------------------------------------------------------------
  if (has(q, /which item|what item|which material|top \d|worst item|held longest|most idle stock|biggest problem/)) {
    const held = project.items
      .map((i) => {
        const led = ledgers[i.code]
        const used = upTo(led.used)
        const first = used.findIndex((x) => x > 0)
        const perMonth = first < 0 ? 0 : sum(used) / (used.findLastIndex((x) => x > 0) - first + 1)
        return { i, months: perMonth > 0 ? sum(upTo(led.idle)) / N / perMonth : 0 }
      })
      .sort((a, b) => b.months - a.months)
      .slice(0, 3)
    const parts = held.map((h) => `${shortName(h.i)} (${cover(h.months)} months of work held on average, though a fresh order takes ${h.i.leadDays} days)`)
    return { understood: true, text: `${scope}, the three items held longest: ${parts.join('; ')}.`, see: { screen: 'register', label: 'Open the stock register' } }
  }

  // ---- what the plan saves -----------------------------------------------------------------------
  if (has(q, /\bsav(e|es|ed|ing|ings)\b|how much less|reduc|benefit|improve|difference|result|better/)) {
    if (!named) {
      const all = project.items.map((i) => stats(i.code))
      const never = all.filter((s) => s.waitMonths === 0).length
      return {
        understood: true,
        text:
          `${scope}, a typical item has ${percent(Math.max(0, median(all.map((s) => s.cut))))} less stock lying idle with our plan. ` +
          `Stock kept on hand falls from ${median(all.map((s) => s.onHandReal)).toFixed(1)} to ${median(all.map((s) => s.onHandOurs)).toFixed(1)} months of work. ` +
          (never === all.length ? 'The site never waits for any of the 16 items.' : `The site never waits for ${never} of the 16 items.`),
        see: { screen: 'overview', label: 'Open the overview' },
      }
    }
    return {
      understood: true,
      text:
        `${scope}, ${name}: ${qty(mine.ours)} ${unit} lying idle on average with our plan, against ${qty(mine.real)} actually. ` +
        (mine.cut > 0.005 ? `That is ${percent(mine.cut)} less. ` : 'There is no gain so far. ') +
        (mine.waitMonths === 0 ? 'The site never waits for it.' : `The site waits in ${mine.waitMonths} months.`),
      about,
      see: { screen: 'item', label: `Replay ${name}` },
    }
  }

  // ---- does the site wait ------------------------------------------------------------------------
  if (has(q, /\bwait|shortage|\bshort\b|run out|ran out|stock ?out|starv/)) {
    if (!named) {
      const waits = project.items.filter((i) => stats(i.code).waitMonths > 0)
      return {
        understood: true,
        text:
          waits.length === 0
            ? `${scope}, the site never waits with our plan, for any of the 16 items.`
            : `${scope}, the site waits with our plan for ${waits.length} of the 16 items: ${waits.map((i) => shortName(i)).join(', ')}.`,
        see: { screen: 'overview', label: 'Open the overview' },
      }
    }
    return {
      understood: true,
      text:
        mine.waitMonths === 0
          ? `${scope}, the site never waits for ${name} with our plan.`
          : `${scope}, the site waits for ${name} in ${mine.waitMonths} months with our plan, at worst for ${qty(mine.worstWait)} ${unit}.`,
      about,
      see: { screen: 'item', label: `Replay ${name}` },
    }
  }

  // ---- what to order -----------------------------------------------------------------------------
  if (has(q, /\border|\bbuy|purchas|\bhold\b|instruction|planner say|plan say|sheet|should (we|i|they)/)) {
    if (!named && has(q, /sheet|all items|everything|stores|plan say|planner say/)) {
      const calls = project.items.map((i) => ({ i, d: run.plans[i.code].decisions[m] }))
      const order = calls.filter((c) => c.d.active && c.d.ordered > 0)
      const hold = calls.filter((c) => c.d.active && c.d.ordered === 0)
      const moves = sum(calls.map((c) => c.d.moves.length))
      const biggest = [...order].sort((a, b) => b.d.ordered / (b.d.forecast || 1) - a.d.ordered / (a.d.forecast || 1)).slice(0, 3)
      return {
        understood: true,
        text:
          `The sheet for ${when}: order ${order.length} items, hold ${hold.length}, and make ${moves} transfers.` +
          (biggest.length ? ` The largest orders against need: ${biggest.map((c) => `${shortName(c.i)} (${qty(c.d.ordered)} ${unitWord(c.i.unit)})`).join(', ')}.` : ''),
        about: { month: m },
        see: { screen: 'sheet', label: 'Open the monthly sheet' },
      }
    }
    const d = plan.decisions[m]
    const lands = m + plan.leadMonths < months.length ? monthLabel(months[m + plan.leadMonths]) : `${plan.leadMonths} months later`
    const call = !d.active ? `In ${when} the planner is still watching ${name}.` : d.ordered > 0 ? `${name} in ${when}: order ${qty(d.ordered)} ${unit}, to land in ${lands}.` : `${name} in ${when}: hold, order nothing.`
    return { understood: true, text: `${call} ${reason(plan, m, unit)}`, about, see: { screen: 'item', label: `Replay ${name}` } }
  }

  // ---- the worst month ---------------------------------------------------------------------------
  if (has(q, /worst|peak|\bmost\b|highest|maximum|\bmax\b|biggest pile/)) {
    return {
      understood: true,
      text:
        `${scope}, the most ${name} lying idle was ${qty(plan.realIdle[mine.peakReal])} ${unit}, in ${monthLabel(months[mine.peakReal])}. ` +
        `With our plan the most would have been ${qty(plan.idle[mine.peakOurs])}, in ${monthLabel(months[mine.peakOurs])}.`,
      about: { item: code, month: mine.peakReal },
      see: { screen: 'item', label: `Replay ${name}` },
    }
  }

  // ---- lead time ---------------------------------------------------------------------------------
  if (has(q, /lead time|how long .*(take|arrive)|days to arrive|delivery time/)) {
    return { understood: true, text: `${name} takes ${item.leadDays} days to arrive after it is ordered, about ${plan.leadMonths} ${plan.leadMonths === 1 ? 'month' : 'months'}.`, about: { item: code } }
  }

  // ---- what arrived ------------------------------------------------------------------------------
  if (has(q, /arriv|deliver|receiv|truck|came in|come in/)) {
    return {
      understood: true,
      text: `In ${when}, ${qty(plan.realDelivered[m])} ${unit} of ${name} actually arrived. In our plan, ${qty(plan.delivered[m])} arrive. ${scope}, ${qty(sum(upTo(plan.realDelivered)))} arrived.`,
      about,
      see: { screen: 'item', label: `Replay ${name}` },
    }
  }

  // ---- what the site used ------------------------------------------------------------------------
  if (has(q, /\bused?\b|\buses\b|usage|consum|put up|install/)) {
    return {
      understood: true,
      text: `The site used ${qty(l.used[m])} ${unit} of ${name} in ${when}. ${scope}, it used ${qty(sum(upTo(l.used)))}.`,
      about,
      see: { screen: 'register', label: 'Open the stock register' },
    }
  }

  // ---- how much was lying idle: also the fallback when an item, month or godown is named ---------
  if (has(q, /idle|unused|lying|stock|pile|inventor|how many|how much/) || named || asked !== null || g !== null) {
    if (g !== null) {
      return {
        understood: true,
        text: `${godownShort(godowns[g].name)} godown held ${qty(l.godowns[g].closing[m])} ${unit} of ${name} at the end of ${when}.`,
        about,
        see: { screen: 'register', label: 'Open the stock register' },
      }
    }
    return {
      understood: true,
      text:
        `${qty(l.idle[m])} ${unit} of ${name} were lying unused at the end of ${when}: ${qty(l.inGodowns[m])} in godowns and ${qty(l.withContractors[m])} with contractors. ` +
        `With our plan it would have been ${qty(plan.idle[m])}.`,
      about,
      see: { screen: 'item', label: `Replay ${name}` },
    }
  }

  return { understood: false, text: HELP }
}
