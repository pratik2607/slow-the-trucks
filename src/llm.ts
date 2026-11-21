// Ask AI's language model. From the same records and replay every other screen uses, the page
// writes out a plain-text sheet of everything up to the cut-off month and sends it, with the
// question, to a small relay (relay/server.js) that asks Gemini on Vertex AI. Nothing after the
// cut-off month is ever written into that sheet, so the model cannot see past it. The page holds
// no key.

import { godownShort, monthLabel, percent, qty, shortName, unitWord } from './lib/format'
import { godowns, ledgers, months, project, type Replay } from './model'

/** The relay's address. It is public and holds no secret: it only answers this site. */
export const RELAY = 'https://slow-the-trucks-ask-646822276399.us-east4.run.app/ask'

const BUFFER: Record<number, string> = { 1.5: 'Lean', 2.25: 'Balanced', 3: 'Careful', 4: 'Safest' }
/** How the plan's average compares with the actual one, in words. */
const gap = (cut: number): string => (Math.abs(cut) < 0.005 ? 'the same' : cut > 0 ? `${percent(cut)} less` : `${percent(-cut)} more`)
const total = (a: readonly number[], from: number, to: number): number => {
  let s = 0
  for (let m = from; m <= to; m++) s += a[m]
  return s
}

/** Everything the model is allowed to read: the records and the replay up to the cut-off month. */
export function buildContext(run: Replay, cutoff: number): string {
  const label = (m: number) => monthLabel(months[m])
  const out: string[] = [
    `Lumino Industries, Kanpur power-line project. Monthly records from ${label(0)} to ${label(cutoff)}. Today is the end of ${label(cutoff)}; nothing later is known.`,
    `Godowns: ${godowns.map((g) => godownShort(g.name)).join(', ')}. ${project.items.length} items. Quantities only: the records carry no prices.`,
    'Words: "actual" is what really happened. "plan" is what the planner would have done, deciding each month from earlier months only. "idle" is stock lying in godowns plus stock issued to contractors and not yet used. "site waiting" is what the site needed and the plan could not supply in that month.',
    `Planner setting: ${BUFFER[run.settings.caution] ?? 'Custom'} buffer.`,
    '',
    'SUMMARY SO FAR (one paragraph per item)',
  ]
  const started = project.items.filter((item) => ledgers[item.code].firstMonth <= cutoff)
  for (const item of project.items) {
    const l = ledgers[item.code]
    const p = run.plans[item.code]
    const name = `${shortName(item)} (code ${item.code}, counted in ${unitWord(item.unit)}, lead time ${item.leadDays} days)`
    if (l.firstMonth > cutoff) {
      out.push(`${name}: no movement yet.`)
      continue
    }
    const first = l.firstMonth
    const n = cutoff - first + 1
    const realAvg = total(p.realIdle, first, cutoff) / n
    const planAvg = total(p.idle, first, cutoff) / n
    let worst = first
    for (let m = first; m <= cutoff; m++) if (p.realIdle[m] > p.realIdle[worst]) worst = m
    let waited = 0
    for (let m = first; m <= cutoff; m++) if (p.waiting[m] > 0) waited++
    const d = p.decisions[cutoff]
    out.push(
      `${name}: delivered so far ${qty(total(p.realDelivered, 0, cutoff))} actual, ${qty(total(p.delivered, 0, cutoff))} plan; used by the site so far ${qty(total(l.used, 0, cutoff))}. ` +
        `Idle now: ${qty(p.realIdle[cutoff])} actual (${qty(l.inGodowns[cutoff])} in godowns, ${qty(l.withContractors[cutoff])} with contractors), ${qty(p.idle[cutoff])} plan. ` +
        `Average idle so far: ${qty(Math.round(realAvg))} actual, ${qty(Math.round(planAvg))} plan${realAvg > 0 ? ` (${gap(1 - planAvg / realAvg)})` : ''}. ` +
        `Worst month so far: ${label(worst)}, ${qty(p.realIdle[worst])} actual, ${qty(p.idle[worst])} plan. ` +
        `Months the site waited under the plan: ${waited}. ` +
        `This month the plan ${!d.active ? 'is still only watching' : d.ordered > 0 ? `orders ${qty(d.ordered)}` : 'orders nothing and holds'}.`,
    )
  }
  out.push('', 'MONTH BY MONTH (one table per item; columns: month, delivered actual, delivered plan, used by site, idle actual, idle plan, plan order placed, site waiting under plan)')
  for (const item of started) {
    const l = ledgers[item.code]
    const p = run.plans[item.code]
    out.push('', `${shortName(item)} (${unitWord(item.unit)})`)
    for (let m = l.firstMonth; m <= cutoff; m++) {
      out.push([label(m), qty(p.realDelivered[m]), qty(p.delivered[m]), qty(l.used[m]), qty(p.realIdle[m]), qty(p.idle[m]), qty(p.decisions[m].ordered), qty(p.waiting[m])].join(' | '))
    }
  }
  return out.join('\n')
}

export interface Turn {
  q: string
  a: string
}

/** Ask the model. `checked` is the app's own worked-out answer, when it has one, for the model to build on. */
export async function askModel(question: string, run: Replay, cutoff: number, checked: string | null, history: Turn[]): Promise<{ text: string; model: string }> {
  const data = buildContext(run, cutoff) + (checked ? `\n\nCHECKED ANSWER from the app's own calculation for this question: ${checked}` : '')
  const res = await fetch(RELAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, asOf: monthLabel(months[cutoff]), data, history }),
    signal: AbortSignal.timeout(22_000),
  })
  const body = (await res.json().catch(() => ({}))) as { text?: string; model?: string; error?: string }
  if (!res.ok || !body.text) throw new Error(body.error ?? `HTTP ${res.status}`)
  return { text: body.text, model: body.model ?? 'Gemini' }
}
