import type { LogLine, MissionView, Worker } from '../types'

type Event = Record<string, unknown> & { ts?: string; kind?: string }

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
// progress.sh is called with 0..1 in the docs and 0..100 in practice.
const pct = (v: unknown) => { const p = num(v); return Math.round(p <= 1 ? p * 100 : p) }

export function describe(e: Event): string | null {
  const w = str(e.worker_id)
  switch (e.kind) {
    case 'mission_start': return `mission started · ${str(e.slug || e.id)}`
    case 'spec_approved': return `spec approved · ${num(e.total_phases)} phases · ${str(e.preset) || 'preset ?'}`
    case 'phase_start': return `phase ${num(e.phase)} started · ${str(e.slug)}`
    case 'dispatch': return `dispatched ${w} → ${str(e.task)}`
    case 'progress': return `${pct(e.percent)}% · ${str(e.current)}`
    case 'complete': return 'done'
    case 'blocker': return `blocked · ${str(e.reason)}`
    case 'validate_start': return `reviewing phase ${num(e.phase)}`
    case 'validate_result': return `phase ${num(e.phase)} · ${str(e.verdict).toUpperCase()}`
    case 'forge': return `forged skill ${str(e.name)}`
    case 'checkpoint': case 'checkpoint_auto_approved': return `checkpoint phase ${num(e.phase)} · ${str(e.decision || 'auto-approved')}`
    case 'heartbeat': return str(e.summary)
    case 'budget_warning': case 'budget_exhausted': return `${e.kind.replace('_', ' ')} · ${str(e.reason || e.detail)}`
    case 'mission_complete': return 'mission complete'
    case 'mission_aborted': return `mission aborted · ${str(e.reason)}`
    default: return e.kind ? e.kind.replaceAll('_', ' ') : e.msg ? str(e.msg) : null
  }
}

function speaker(e: Event): Pick<LogLine, 'who' | 'role'> {
  if (e.kind === 'progress' || e.kind === 'complete' || e.kind === 'blocker') return { who: str(e.worker_id) || 'worker', role: 'worker' }
  if (e.kind === 'validate_start' || e.kind === 'validate_result' || e.actor === 'validator') return { who: 'reviewer', role: 'reviewer' }
  if (e.actor === 'system' || e.kind === 'mission_start') return { who: 'mission', role: 'system' }
  return { who: 'orchestrator', role: 'orchestrator' }
}

function tone(e: Event): LogLine['tone'] {
  const verdict = str(e.verdict).toUpperCase()
  if (e.kind === 'blocker' || e.kind === 'mission_aborted' || e.kind === 'budget_exhausted' || verdict === 'FAIL') return 'warn'
  if (e.kind === 'complete' || e.kind === 'mission_complete' || verdict === 'PASS') return 'ok'
  return 'info'
}

export function summarize(log: string): MissionView | null {
  const events: Event[] = log.split('\n').flatMap(line => {
    try { return line.trim() ? [JSON.parse(line) as Event] : [] } catch { return [] }
  })
  const start = events.find(e => e.kind === 'mission_start')
  if (!start) return null

  const view: MissionView = {
    id: str(start.id), status: 'running', startedAt: str(start.ts), endedAt: '', preset: '',
    totalPhases: 0, phases: [], workers: [], reviews: [], updates: [],
  }
  const workers = new Map<string, Worker>()
  for (const e of events) {
    const id = str(e.worker_id)
    const text = describe(e)
    if (text) view.updates.push({ at: str(e.ts), ...speaker(e), text, tone: tone(e) })
    if (e.kind === 'spec_approved') { view.totalPhases = num(e.total_phases); view.preset = str(e.preset) }
    if (e.kind === 'phase_start') view.phases.push({ n: num(e.phase), slug: str(e.slug), verdict: '' })
    if (e.kind === 'validate_result') {
      const verdict = str(e.verdict).toUpperCase()
      view.reviews.push({ phase: num(e.phase), verdict, at: str(e.ts) })
      view.phases = view.phases.map(p => (p.n === num(e.phase) ? { ...p, verdict } : p))
    }
    if (e.kind === 'dispatch') {
      workers.set(id, { id, phase: num(e.phase), task: str(e.task), model: str(e.model), subagent: str(e.subagent), percent: 0, current: 'dispatched', state: 'running', startedAt: str(e.ts), endedAt: '' })
    }
    const w = workers.get(id)
    if (w && e.kind === 'progress') workers.set(id, { ...w, percent: pct(e.percent), current: str(e.current) })
    if (w && e.kind === 'complete') workers.set(id, { ...w, percent: 100, current: 'done', state: 'done', endedAt: str(e.ts) })
    if (w && e.kind === 'blocker') workers.set(id, { ...w, current: str(e.reason), state: 'blocked', endedAt: str(e.ts) })
    if (e.kind === 'mission_complete') { view.status = 'complete'; view.endedAt = str(e.ts) }
    if (e.kind === 'mission_aborted') { view.status = 'aborted'; view.endedAt = str(e.ts) }
  }
  return { ...view, workers: [...workers.values()], updates: view.updates.slice(-60) }
}
