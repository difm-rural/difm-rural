// Run with: npm test   (whole suite), or on its own:
//   node --import ./tests/support/ts-resolve.mjs shared/onTheGo.test.ts
import assert from 'node:assert/strict'
import { latestTime, rankOnTheGo, ON_THE_GO_LIMIT } from './onTheGo.ts'

let passed = 0
function check(name: string, got: unknown, expected: unknown) {
  assert.deepEqual(got, expected, `${name}\n  got:      ${JSON.stringify(got)}\n  expected: ${JSON.stringify(expected)}`)
  passed++
}

const item = (key: string, needsAction: boolean, updatedAt: unknown) => ({ key, needsAction, updatedAt })
const keys = (result: { shown: { key: string }[] }) => result.shown.map(row => row.key)

// ---- Ordering ----
check('needsAction first, then most recently updated',
  keys(rankOnTheGo([
    item('old-waiting', false, '2026-11-01T00:00:00Z'),
    item('new-waiting', false, '2026-11-16T00:00:00Z'),
    item('old-action', true, '2026-10-01T00:00:00Z'),
    item('new-action', true, '2026-11-10T00:00:00Z'),
  ], 10)),
  ['new-action', 'old-action', 'new-waiting', 'old-waiting'])

check('an old item that needs action beats a brand-new one that does not',
  keys(rankOnTheGo([item('fresh', false, '2026-11-17T09:00:00Z'), item('stale-action', true, '2026-01-01T00:00:00Z')])),
  ['stale-action', 'fresh'])

check('"updated" is the latest of several timestamps',
  keys(rankOnTheGo([
    item('created-recently', false, ['2026-11-12T00:00:00Z']),
    item('accepted-later', false, ['2026-11-01T00:00:00Z', '2026-11-15T00:00:00Z', null]),
  ])),
  ['accepted-later', 'created-recently'])

check('missing or invalid timestamps sort last within their group',
  keys(rankOnTheGo([item('no-time', false, null), item('bad-time', false, 'not a date'), item('dated', false, '2026-11-01T00:00:00Z')])),
  ['dated', 'no-time', 'bad-time'])

check('ties keep their original order',
  keys(rankOnTheGo([item('a', true, '2026-11-01T00:00:00Z'), item('b', true, '2026-11-01T00:00:00Z'), item('c', true, '2026-11-01T00:00:00Z')])),
  ['a', 'b', 'c'])

// ---- The 3-item cap ----
const five = [
  item('w1', false, '2026-11-01T00:00:00Z'),
  item('a1', true, '2026-11-02T00:00:00Z'),
  item('w2', false, '2026-11-05T00:00:00Z'),
  item('a2', true, '2026-11-03T00:00:00Z'),
  item('w3', false, '2026-11-04T00:00:00Z'),
]
const capped = rankOnTheGo(five)
check('default cap is 3', ON_THE_GO_LIMIT, 3)
check('cap · shows the top 3', keys(capped), ['a2', 'a1', 'w2'])
check('cap · counts the total', capped.total, 5)
check('cap · says how many are left out', capped.more, 2)

check('cap · fewer than 3 shows them all with none left out',
  (({ shown, total, more }) => [shown.length, total, more])(rankOnTheGo(five.slice(0, 2))), [2, 2, 0])
check('cap · exactly 3 leaves none out', rankOnTheGo(five.slice(0, 3)).more, 0)
check('cap · empty list', rankOnTheGo([]), { shown: [], total: 0, more: 0 })
check('cap · a custom limit', keys(rankOnTheGo(five, 1)), ['a2'])
check('cap · zero or negative limit shows nothing', rankOnTheGo(five, -1).shown, [])
check('the input list is not changed', five.map(row => row.key), ['w1', 'a1', 'w2', 'a2', 'w3'])

// ---- latestTime ----
check('latestTime · single value', latestTime('2026-11-01T00:00:00Z'), Date.parse('2026-11-01T00:00:00Z'))
check('latestTime · Date objects', latestTime([new Date('2026-11-02T00:00:00Z')]), Date.parse('2026-11-02T00:00:00Z'))
check('latestTime · nothing usable', latestTime([null, undefined, '', 'nope']), 0)

console.log(`\n✅ onTheGo: all ${passed} cases passed`)
