// Run with: node shared/dates.test.ts   (Node >= 23.6 strips TS types natively)
import assert from 'node:assert/strict'
import { parseNzDate } from './dates.ts'

let passed = 0
function eq(input: unknown, expected: string | null) {
  const got = parseNzDate(input)
  assert.equal(got, expected, `parseNzDate(${JSON.stringify(input)}) → ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`)
  passed++
}

// ISO
eq('2026-11-11', '2026-11-11')
eq('2026-02-29', null)          // 2026 not a leap year
eq('2024-02-29', '2024-02-29')  // leap year ok

// Month names (case-insensitive, optional comma, short + long)
eq('11 Nov 2026', '2026-11-11')
eq('11 November 2026', '2026-11-11')
eq('11 NOV 2026', '2026-11-11')
eq('1 Dec 2026', '2026-12-01')
eq('11 Nov, 2026', '2026-11-11')
eq('11 Sept 2026', '2026-09-11')
eq('11 Foo 2026', null)         // not a month

// Numeric DAY/MONTH/YEAR (NZ order), slash or dash
eq('11/11/2026', '2026-11-11')
eq('11-11-2026', '2026-11-11')
eq('1/2/2026', '2026-02-01')    // 1 Feb, not 2 Jan
eq('13/11/2026', '2026-11-13')  // 13 is a valid day → month 11
eq('11/13/2026', null)          // month 13 invalid (NZ order)
eq('31/02/2026', null)          // 31 Feb impossible

// Two-digit years → 20xx
eq('11/11/26', '2026-11-11')
eq('11 Nov 26', '2026-11-11')
eq('11-11-26', '2026-11-11')

// Junk / edge
eq('', null)
eq('   ', null)
eq('hello', null)
eq('2026/11/11', null)          // ISO must use dashes; 2026 too long for D/M/Y day
eq('11 Nov', null)              // missing year
eq(undefined, null)
eq(null, null)
eq(42, null)

console.log(`\n✅ parseNzDate: all ${passed} cases passed`)
