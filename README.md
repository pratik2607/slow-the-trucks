# Slow the Trucks

A stock and ordering planner for Lumino Industries, built for the "1,700 Poles" problem statement at Vibe Coders Hackathon Edition 3 (Calcutta AI Club, 21 November 2026).

**Live app: https://pratik2607.github.io/slow-the-trucks/** (opens without signing in)

Lumino orders material months ahead and ships it to site stores on a fixed plan, whatever the site actually uses. Stock piles up, because nobody slows the trucks. In Lumino's records for this project, 48,991 PCC poles were lying idle in the worst month.

This app replays that real project month by month and shows what a planner that orders from actual usage would have done instead.

## What it shows

On the default settings, across all 16 items and 44 months:

| | Actual | Our plan |
|---|---|---|
| Stock lying idle, typical item | | 44% less |
| Stock kept on hand, typical item | 14.5 months of work | 7.0 months |
| Biggest pile, typical item | | 27% smaller |
| Items the site ever waited for | | none of 16 |
| PCC poles lying idle, on average | 26,201 | 13,758 |
| PCC poles lying idle, worst month | 48,991 | 18,978 |

Everything is counted in quantities. Lumino's records carry no prices, so the app shows none.

## Lumino's three jobs

| Job in the brief | Where it is |
|---|---|
| 1. See it: every item and godown, month by month | Stock register |
| 2. Plan it: replay the project, seeing only what was known at each date | Overview, Monthly sheet, Item replay |
| 3. Match the sets: flag every month a set is out of balance, in any godown | Set check |

## Ask AI

A chat over the data, answered by a language model (Gemini on Vertex AI). The page writes out the records and the replay as plain text and sends them with the question; the model answers from that text alone.

It has a data cut-off month. Only the records up to that month are sent, so the model cannot see past it; a test checks that the text holds no later month. The app's own calculation runs first: it declines a question about a later month before any model is asked, hands the model checked figures to build on, and is the answer shown if the model cannot be reached.

A static site cannot keep a key, so the question goes through a small relay (`relay/server.js`) on Cloud Run. The relay holds no key either: it signs its calls with the cloud project's own identity. It answers only this site, fixes the model's instructions on the server, and limits how much and how often it can be asked.

## How the planner decides

At the start of every month, using earlier months only:

1. It works out how fast the site has been using the item (the average of the last nine months).
2. It counts what is on hand and what is already ordered and on the way.
3. It works out how long that must last: the lead time, one more month until the next decision, and a buffer for bumpy usage.
4. If there is a gap it orders the gap, and sends it to the godowns that are shortest. Otherwise it holds.
5. Before buying, a godown that is running low takes from one that has spare.

Then the month plays out against what the site really used. If stock runs out, that is counted as the site waiting.

## What keeps the replay honest

- **It never looks ahead.** A test wipes every record after a given month and checks that no decision before it changes.
- **The same work gets done.** In both worlds the site uses exactly what it really used, in the same months.
- **Trucks already on the road still arrive.** The planner waits for three months of real usage, and any delivery ordered before that is kept as it happened. For poles, with a 150-day lead time, its first order lands in December 2023.
- **Shortages are shown, not hidden.** The buffer has four settings and each shows both what it saves and whether the site waits. The default is the safest one.

## What is inferred, and says so in the app

- **Planned project quantity.** The brief says material is ordered on a fixed plan, so each item's total is settled in advance. The data pack does not state it, so it is taken as what the fixed plan delivered, and the planner never orders beyond it. This is the one figure read from the whole record. It can be switched off under Plan settings; the typical saving then drops from 44% to 40% and the plan over-buys at the end of the project.
- **Usage per godown.** Lumino records usage for the whole project, not per godown. Each month's usage is split between godowns in proportion to what each had issued so far.
- **Set ratios.** Lumino's ratio matches what the site actually used only for the eye hook. The set check uses the site's real figure by default and lets you switch to Lumino's or type your own. Lumino's note says to ask its team before relying on the given ratio.

Three items show no gain: they were bought almost entirely before the first unit was used, so a planner that learns from usage has nothing to act on.

## How it is built

- React, TypeScript and Vite. A static site with nothing to sign in to. The one server-side piece is the Ask AI relay in `relay/`; there are no keys anywhere, in the page, the relay or this repository.
- Every push to `main` runs the tests, builds the site and publishes it to GitHub Pages.
- `scripts/build-data.mjs` turns Lumino's raw CSVs into one monthly table (`src/data/project.json`). The raw files belong to Lumino and are not in this repository.
- `src/engine/` holds the logic as plain functions: `ledger.ts` (job 1), `planner.ts` (job 2), `sets.ts` (job 3).
- 51 tests cover the stock sums, the replay, the set check, the chat and what the language model is sent.

```bash
npm install
npm run dev
npm test
```

Built in one day with Claude Code.
