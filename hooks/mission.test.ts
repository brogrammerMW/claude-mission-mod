import { test, expect } from 'claude-code/testing'
import { summarize } from './summary'
import { roleOf } from './register'

const log = [
  '{"ts":"2026-07-12T17:23:35Z","kind":"mission_start","id":"m1","slug":"demo"}',
  '{"ts":"2026-07-12T17:31:28Z","kind":"spec_approved","total_phases":2}',
  '{"ts":"2026-07-12T17:32:15Z","kind":"phase_start","phase":1,"slug":"setup"}',
  '{"ts":"2026-07-12T17:32:16Z","kind":"dispatch","worker_id":"w-1-a","phase":1,"task":"a","subagent":"backend-specialist","model":"sonnet"}',
  '{"ts":"2026-07-12T17:32:17Z","kind":"dispatch","worker_id":"w-1-b","phase":1,"task":"b","subagent":"doc-updater","model":"sonnet"}',
  '{"ts":"2026-07-12T17:32:49Z","kind":"progress","worker_id":"w-1-a","percent":0.42,"current":"writing test"}',
  '{"ts":"2026-07-12T17:32:50Z","kind":"progress","worker_id":"w-1-b","percent":25,"current":"docs"}',
  'not json',
  '{"ts":"2026-07-12T17:33:49Z","kind":"complete","worker_id":"w-1-b"}',
  '{"ts":"2026-07-12T17:34:00Z","kind":"validate_result","phase":1,"verdict":"pass"}',
].join('\n')

test('summarizes a mission log', () => {
  const v = summarize(log)!
  expect(v.id).toBe('m1')
  expect(v.status).toBe('running')
  expect(v.totalPhases).toBe(2)
  expect(v.phases).toEqual([{ n: 1, slug: 'setup', verdict: 'PASS' }])
  expect(v.workers.map(w => [w.id, w.percent, w.state])).toEqual([['w-1-a', 42, 'running'], ['w-1-b', 100, 'done']])
  expect(v.updates.at(-1)).toEqual({ at: '2026-07-12T17:34:00Z', who: 'reviewer', role: 'reviewer', text: 'phase 1 · PASS', tone: 'ok' })
  expect(v.reviews).toEqual([{ phase: 1, verdict: 'PASS', at: '2026-07-12T17:34:00Z' }])
  expect(v.workers[1]!.endedAt).toBe('2026-07-12T17:33:49Z')
  expect(v.updates.find(u => u.who === 'w-1-a')!.role).toBe('worker')
  expect(summarize(log + '\n{"kind":"mission_complete"}')!.status).toBe('complete')
  expect(summarize('')).toBe(null)
})

test('routes Agent calls to mission roles', () => {
  expect(roleOf('Read /x/worker-role.md and implement')).toBe('worker')
  expect(roleOf('You are the validator. Read validator-role.md')).toBe('reviewer')
  // Unrelated agents keep their own model while routing is armed.
  expect(roleOf('Add a schema validator to the config loader')).toBe(null)
  expect(roleOf('Review this diff for bugs')).toBe(null)
  expect(roleOf('Find all usages of foo')).toBe(null)
})
