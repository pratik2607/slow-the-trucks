// Turns Lumino's raw CSVs (kept out of git) into the one monthly table the app runs on.
//
//   node scripts/build-data.mjs [path-to-csv-folder]
//
// Rules followed, all from the data pack's own README:
//   - rows that look identical are separate entries: nothing is de-duplicated
//   - rows with a quantity of 0 are ignored
//   - qty is always positive; `type` / `direction` gives the sign
//   - CONSUMPTION has no godown, so usage is kept for the whole project only
//   - KANPUR CLOSER is the closing store, not a project godown

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = process.argv[2] ?? join(root, 'data/raw/lumino-vch3-data/csv')
const outFile = join(root, 'src/data/project.json')

const CLOSING_STORE = 'KANPUR CLOSER'

/** Minimal RFC 4180 reader: handles quoted fields, escaped quotes and CRLF. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c !== '\r') field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows
  return body
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

const read = (name) => parseCsv(readFileSync(join(rawDir, name), 'utf8'))

const itemsRaw = read('items.csv')
const setsRaw = read('sets.csv')
const receipts = read('receipts.csv')
const moves = read('contractor_moves.csv')
const transfers = read('transfers.csv')

// ---- the calendar: every month from the first entry to the last --------------------------------
const allDates = [...receipts, ...moves, ...transfers].map((r) => r.date)
const first = allDates.reduce((a, b) => (a < b ? a : b)).slice(0, 7)
const last = allDates.reduce((a, b) => (a > b ? a : b)).slice(0, 7)
const months = []
for (let [y, m] = first.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= last; ) {
  months.push(`${y}-${String(m).padStart(2, '0')}`)
  if (++m > 12) {
    m = 1
    y++
  }
}
const monthIndex = new Map(months.map((m, i) => [m, i]))

// ---- the six project godowns, in Lumino's own code order (KAN01..KAN06) -------------------------
const codeByGodown = new Map()
for (const t of transfers) if (t.godown !== CLOSING_STORE) codeByGodown.set(t.godown, t.godown_code)
for (const r of receipts) if (!codeByGodown.has(r.godown)) codeByGodown.set(r.godown, 'ZZ')
const godowns = [...codeByGodown.entries()]
  .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
  .map(([name, code]) => ({ code, name }))
const godownIndex = new Map(godowns.map((g, i) => [g.name, i]))

// ---- empty flow tables ---------------------------------------------------------------------------
const zeros = () => new Array(months.length).fill(0)
const flows = {}
for (const it of itemsRaw) {
  flows[it.item_code] = {
    use: zeros(),
    g: godowns.map(() => ({
      rec: zeros(), // received from vendors
      recN: zeros(), // number of receipts (GRNs) - roughly, trucks
      tin: zeros(), // transfer in from another store
      tout: zeros(), // transfer out to another store
      close: zeros(), // sent to the closing store at wind-up
      iss: zeros(), // issued to contractors
      ret: zeros(), // returned by contractors
    })),
  }
}

const skipped = { zeroQty: 0, unknownItem: 0, unknownGodown: 0, closingStoreRows: 0 }
const cell = (row, godown) => {
  const f = flows[row.item_code]
  if (!f) return void skipped.unknownItem++
  const gi = godownIndex.get(godown)
  if (gi === undefined) return void skipped.unknownGodown++
  return f.g[gi]
}

for (const r of receipts) {
  const q = Number(r.qty_received)
  if (!(q > 0)) { skipped.zeroQty++; continue }
  const c = cell(r, r.godown)
  if (!c) continue
  const mi = monthIndex.get(r.date.slice(0, 7))
  c.rec[mi] += q
  c.recN[mi] += 1
}

const closingStoreIn = {}
for (const t of transfers) {
  const q = Number(t.qty)
  if (!(q > 0)) { skipped.zeroQty++; continue }
  if (t.godown === CLOSING_STORE) {
    skipped.closingStoreRows++
    if (t.direction === 'IN') closingStoreIn[t.item_code] = (closingStoreIn[t.item_code] ?? 0) + q
    continue
  }
  const c = cell(t, t.godown)
  if (!c) continue
  const mi = monthIndex.get(t.date.slice(0, 7))
  if (t.direction === 'IN') c.tin[mi] += q
  else if (t.voucher_type === 'Issue to the closing store') c.close[mi] += q
  else c.tout[mi] += q
}

for (const m of moves) {
  const q = Number(m.qty)
  if (!(q > 0)) { skipped.zeroQty++; continue }
  const mi = monthIndex.get(m.date.slice(0, 7))
  if (m.type === 'CONSUMPTION') {
    const f = flows[m.item_code]
    if (!f) { skipped.unknownItem++; continue }
    f.use[mi] += q
    continue
  }
  const c = cell(m, m.godown)
  if (!c) continue
  if (m.type === 'ISSUE') c.iss[mi] += q
  else if (m.type === 'RETURN') c.ret[mi] += q
}

// ---- write ---------------------------------------------------------------------------------------
const round = (x) => Math.round(x * 1e4) / 1e4
const roundAll = (a) => a.map(round)
for (const f of Object.values(flows)) {
  f.use = roundAll(f.use)
  for (const g of f.g) for (const k of Object.keys(g)) g[k] = roundAll(g[k])
}

const out = {
  meta: {
    project: 'Lumino power line project, six districts around Kanpur',
    months,
    godowns,
    closingStore: CLOSING_STORE,
    sourceRows: { receipts: receipts.length, contractorMoves: moves.length, transfers: transfers.length },
    skipped,
    closingStoreIn: Object.fromEntries(Object.entries(closingStoreIn).map(([k, v]) => [k, round(v)])),
  },
  items: itemsRaw.map((it) => ({
    code: it.item_code,
    name: it.item_name,
    unit: it.unit,
    leadDays: Number(it.lead_time_days),
    role: it.role,
  })),
  sets: setsRaw.map((s) => ({
    setNo: s.set_no,
    parent: s.parent_code,
    child: s.child_code,
    ratio: Number(s.ratio_of_parent),
  })),
  flows,
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(out))

const total = (code, key) => flows[code].g.reduce((s, g) => s + g[key].reduce((a, b) => a + b, 0), 0)
console.log(`months ${months[0]}..${months.at(-1)} (${months.length}), godowns ${godowns.map((g) => g.code).join(' ')}`)
console.log('rows', out.meta.sourceRows, 'skipped', skipped)
for (const it of out.items) {
  const used = flows[it.code].use.reduce((a, b) => a + b, 0)
  console.log(
    it.code.padEnd(10),
    it.unit.padEnd(4),
    'received', String(round(total(it.code, 'rec'))).padStart(11),
    'issued', String(round(total(it.code, 'iss'))).padStart(11),
    'returned', String(round(total(it.code, 'ret'))).padStart(10),
    'used', String(round(used)).padStart(11),
    'toClosing', String(round(total(it.code, 'close'))).padStart(10),
  )
}
console.log(`wrote ${outFile} (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`)
