import { test, expect } from 'claude-code/testing'
import { missionClock, pill, rule, splitId } from './format'

test('pill bar matches the ▰▱ style and clamps', () => {
  expect(pill(50, 10)).toEqual({ fill: '▰▰▰▰▰', empty: '▱▱▱▱▱' })
  expect(pill(0, 4)).toEqual({ fill: '', empty: '▱▱▱▱' })
  expect(pill(140, 4)).toEqual({ fill: '▰▰▰▰', empty: '' })
})

test('mission clock', () => {
  const start = '2026-10-06T23:50:00Z'
  expect(missionClock(start, Date.parse('2026-10-07T00:10:52Z'))).toBe('T+20:52')
  expect(missionClock(start, Date.parse('2026-10-07T01:00:05Z'))).toBe('T+1:10:05')
  expect(missionClock('nope', 0)).toBe('T+--:--')
})

test('rule and id split', () => {
  const r = rule('LOG', 12)
  expect(r.head + r.tail).toBe('── LOG ─────')
  expect(splitId('20261006-jev-explainer-html-e6e5a6e6')).toEqual({ name: 'jev-explainer-html', tag: 'e6e5a6e6' })
  expect(splitId('custom')).toEqual({ name: 'custom', tag: '' })
})

import { lane, timer } from './format'

test('swimlane geometry and timer', () => {
  expect(lane(0, 50, 0, 100, 10)).toEqual({ before: 0, bar: 5, after: 5 })
  expect(lane(50, 100, 0, 100, 10)).toEqual({ before: 5, bar: 5, after: 0 })
  expect(lane(100, 100, 0, 100, 10)).toEqual({ before: 9, bar: 1, after: 0 })
  expect(timer(121_000)).toBe('2:01')
  expect(timer(3_900_000)).toBe('1h05')
})

import { hms } from './format'

test('log times are in the computer’s time zone', () => {
  const iso = '2026-10-07T00:10:52Z'
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  expect(hms(iso)).toBe(`${two(d.getHours())}:${two(d.getMinutes())}:52`)
  expect(hms('nope')).toBe('--:--:--')
})
