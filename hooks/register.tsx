import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register, Timer } from 'claude-code'

import type { ModelAlias, Models, MissionView } from '../types'
import { summarize } from './summary'
import { hms, lane, missionClock, pill, shorten, splitId, timer } from './format'

const PANE = 'mission'
const MIN_COLS = 34
// Below this body width the pane switches to its compact labels.
const NARROW = 56
const FULL_ID: Record<ModelAlias, string> = {
  fable: 'claude-fable-5-1',
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-4-5-20251001',
}
const DEFAULT_MODELS: Models = { orchestrator: 'opus', worker: 'sonnet', reviewer: 'fable' }
// Theme color names, so the pane follows light, dark and color-blind themes.
const C = {
  main: 'claude', agent: 'suggestion', arch: 'merged', ok: 'success', amber: 'warning',
  warn: 'error', dim: 'inactive', faint: 'subtle', text: 'text',
}
const ALIASES = Object.keys(FULL_ID).map(value => ({ value, label: value }))

const models = atom({ plugin: 'mission', key: 'models' } as const, DEFAULT_MODELS)
const view = atom({ plugin: 'mission', key: 'view' } as const, null)
const isArmed = atom({ plugin: 'mission', key: 'isArmed' } as const, false)
const goal = atom({ plugin: 'mission', key: 'goal' } as const, '')
const now = atom({ plugin: 'mission', key: 'now' } as const, 0)

let poll: Timer | undefined

// Which mission role an Agent call plays, from the skill's own role files only:
// a loose word or subagent name would reroute unrelated agents while armed.
export function roleOf(prompt: string): 'worker' | 'reviewer' | null {
  if (/validator-role\.md/.test(prompt)) return 'reviewer'
  if (/worker-role\.md|\.mission-context\.md|\bworker `?w-\d/i.test(prompt)) return 'worker'
  return null
}

async function latestLog($: Engine): Promise<string | null> {
  const root = `${await $.session.cwd()}/.missions`
  if (!(await $.fs.exists(root))) return null
  let best: { path: string; mtime: number } | null = null
  for (const entry of await $.fs.list(root)) {
    if (entry.kind !== 'dir') continue
    const path = `${root}/${entry.name}/log.jsonl`
    try {
      const { mtimeMs } = await $.fs.stat(path)
      if (!best || mtimeMs > best.mtime) best = { path, mtime: mtimeMs }
    } catch { /* no log yet */ }
  }
  return best && (await $.fs.read(best.path))
}

async function refresh($: Engine) {
  try {
    const log = await latestLog($)
    const next = log ? summarize(log) : null
    const prev = await read($, view)
    if (JSON.stringify(next) !== JSON.stringify(prev)) await update($, view, () => next)
    // Keep the T+ clock moving only while a mission runs.
    if (next?.status === 'running') { const t = await $.clock.now(); await update($, now, () => t) }
    if (next && next.status !== 'running' && (await read($, isArmed))) {
      await update($, isArmed, () => false)
      $.ui.toast(`Mission ${next.status}: ${next.id}`)
    }
  } catch (err) {
    $.ui.log(`mission: refresh failed: ${String(err)}`, { to: 'debug' })
  }
}

// The dock takes a quarter of the terminal; a width the person dragged still wins.
async function openPane($: Engine, terminalColumns: number) {
  await $.ui.open({ id: PANE, title: 'Mission', columns: Math.max(MIN_COLS, Math.round(terminalColumns / 4)) })
  await startPolling($)
}

// `poll` is a module variable, and a hot reload drops the old load's timers, so
// session.start (which fires again on reload) calls this too.
async function startPolling($: Engine) {
  await refresh($)
  poll ??= $.clock.every(1000, () => void refresh($))
}

async function setModel($: Engine, role: keyof Models, value: string) {
  const next = await update($, models, m => ({ ...m, [role]: value }))
  await $.store.set('models', next)
  const running = (await read($, view))?.status === 'running'
  if (running && (await read($, isArmed))) $.ui.toast('Changed mid-mission: re-validate the last passed phase (mission-skill rule).')
}

// Starts the run once the command has returned and the session is idle; if the
// prompt does not enter, leave it in the composer so one Enter starts it.
async function startMission($: Engine, text: string) {
  try {
    const entered = await $.prompt.submit({ text })
    if (entered.drop === undefined) return
    $.ui.toast(`Mission prompt was refused: ${String(entered.drop)}`)
  } catch (err) {
    $.ui.log(`mission: submit failed: ${String(err)}`, { to: 'debug' })
  }
  await $.prompt.fill({ text })
  $.ui.toast('Press Enter to start the mission.')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'mission', description: 'Mission pane; `/mission <goal>` starts a mission-skill mission' })
    const saved = (await $.store.get('models')) as Models | undefined
    if (saved) await update($, models, () => ({ ...DEFAULT_MODELS, ...saved }))
    // $.state outlives a reload: pick a live mission back up.
    if ((await read($, view))?.status === 'running' || (await read($, isArmed))) void startPolling($)
    return next(e)
  })

  on('command.run', { command: 'mission' }, async ($, e) => {
    await openPane($, e.presentation.columns)
    const args = e.args.trim()
    if (args === 'stop') {
      await update($, isArmed, () => false)
      return { text: 'Mission routing off. The pane stays as a viewer.' }
    }
    if (!args) return { text: 'Mission pane opened.' }
    await update($, isArmed, () => true)
    await update($, goal, () => args)
    $.clock.after(250, () => void startMission($, `Use the mission-skill skill to run this mission: ${args}`))
    const m = await read($, models)
    return { text: `Mission armed: orchestrator ${m.orchestrator}, workers ${m.worker}, reviewer ${m.reviewer}.` }
  })

  on('ui.close', ($, e, next) => {
    if (e.id === PANE) { poll?.cancel(); poll = undefined }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!(await read($, isArmed))) return composed
    const m = await read($, models)
    const orch = m.orchestrator === 'session' ? 'the session model' : m.orchestrator
    const text = [
      'Mission mod is active for this session.',
      '- Mission Control is the `mission` pane in Claude Code. Skip the Mission Control URL gate: do not run mission-control.sh, start a server, or open a browser. Keep calling every lifecycle script (log-event, start-phase, progress, validate-result, ...): the pane reads .missions/<id>/log.jsonl.',
      `- Model routing replaces the skill's grok/gpt defaults: orchestrator ${orch}; workers: Agent tool with model "${m.worker}"; validator: a fresh Agent with model "${m.reviewer}". Ignore the Cursor model slugs the scripts print.`,
      `- When calling approve-spec.sh pass --orchestrator ${orch.replace(/ /g, '-')} --worker ${m.worker} --validator ${m.reviewer}.`,
    ].join('\n')
    return { sections: [...composed.sections, { id: 'mission-routing', text, scope: 'session' }] }
  })

  // Enforce the picked models even if the orchestrator forgets the `model` field.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const role = roleOf(e.prompt)
    const m = await Promise.all([read($, isArmed), read($, models)]).catch(() => null)
    if (!role || !m || !m[0]) return next(e)
    return next({ ...e, model: role === 'worker' ? m[1].worker : m[1].reviewer })
  })

  on('turn.step', async function* ($, e, next) {
    const m = await read($, models)
    const isMain = e.agentId === undefined
    if (!isMain || m.orchestrator === 'session' || !(await read($, isArmed))) return yield* next(e)
    return yield* next({ ...e, model: FULL_ID[m.orchestrator] })
  })

  // Layout and palette follow scasella/claude-flightdeck (MIT): a centered title bar with a
  // legend, one rounded card per role in that role's theme color, swimlanes, and a log card.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // The mobile app draws no Select yet: there the pane is a viewer only.
    const Select = 'Select' in els ? els.Select : null
    const m = await read($, models)
    const v: MissionView | null = await read($, view)
    const armed = await read($, isArmed)
    const pending = await read($, goal)
    const nowMs = (await read($, now)) || (await $.clock.now())
    // Size to the pane's own body, not the whole terminal (viewport is the surface).
    const cols = Math.max(24, e.props.bodyColumns)
    const narrow = cols < NARROW
    const rows = e.viewport?.rows ?? 40
    const inner = cols - 4

    const Gauge = ({ percent, width, color }: { percent: number; width: number; color: string }) => {
      const g = pill(percent, width)
      return <Text><Text color={color}>{g.fill}</Text><Text color={C.faint}>{g.empty}</Text></Text>
    }
    const Divider = () => <Text color={C.faint}>{'─'.repeat(cols)}</Text>
    const picker = (role: keyof Models, color: string) => Select
      ? <Select key={`model-${role}`} value={m[role]}
          options={role === 'orchestrator' ? [{ value: 'session', label: 'session model' }, ...ALIASES] : ALIASES}
          onSelect={(value: string) => void setModel($, role, value)} />
      : <Text color={color} bold>{m[role]}</Text>

    const statusWord = !v ? (armed && pending ? 'STARTING' : 'STANDBY') : v.status.toUpperCase()
    const statusColor = !v ? (armed ? C.amber : C.dim) : v.status === 'complete' ? C.ok : v.status === 'aborted' ? C.warn : C.amber
    const spanEnd = v?.endedAt ? Date.parse(v.endedAt) : nowMs
    const routing = <Text color={armed ? C.ok : C.dim}>{armed ? 'ROUTING ON' : 'ROUTING OFF'}</Text>
    const titleBar = (
      <Box flexDirection="column" alignItems="center">
        <Text bold wrap="truncate">
          <Text color={C.text}>MISSION</Text>
          <Text color={C.dim}> · </Text>
          <Text color={statusColor}>{statusWord}</Text>
          {v && <Text color={C.dim}> · </Text>}
          {v && <Text color={C.main}>{missionClock(v.startedAt, spanEnd)}</Text>}
          {!narrow && <Text color={C.dim}> · </Text>}
          {!narrow && routing}
        </Text>
        {narrow && <Text bold>{routing}</Text>}
        <Text wrap="truncate">
          <Text color={C.main}>■</Text><Text color={C.dim}>{narrow ? ' orch  ' : ' orchestrator  '}</Text>
          <Text color={C.agent}>■</Text><Text color={C.dim}>{narrow ? ' work  ' : ' workers  '}</Text>
          <Text color={C.arch}>■</Text><Text color={C.dim}>{narrow ? ' review' : ' reviewer'}</Text>
        </Text>
      </Box>
    )

    // ---- orchestrator card
    const total = v ? Math.max(v.totalPhases, v.phases.length) : 0
    const passed = v ? v.phases.filter(p => p.verdict === 'PASS').length : 0
    const overall = total ? Math.round((passed / total) * 100) : 0
    const active = v?.phases.find(p => !p.verdict)
    const { name, tag } = v ? splitId(v.id) : { name: pending || 'no mission yet', tag: '' }
    const orchestratorCard = (
      <Box flexDirection="column" borderStyle="round" borderColor={C.main} paddingX={1}>
        <Box justifyContent="space-between">
          <Text color={C.main} bold>ORCHESTRATOR · {m.orchestrator === 'session' ? 'session' : m.orchestrator}</Text>
          <Text color={v?.status === 'running' ? C.main : C.dim}>{v?.status === 'running' ? '● working' : v ? '✓ done' : '○ idle'}</Text>
        </Box>
        <Text wrap="truncate-end"><Text bold>{shorten(name, inner - 10)}</Text><Text color={C.faint}>{tag && `  ${tag}`}</Text></Text>
        {v ? (
          <Text wrap="truncate">
            <Text color={C.dim}>phases </Text><Gauge percent={overall} width={Math.min(12, Math.max(4, total * 3))} color={C.main} />
            <Text color={C.main} bold> {passed}/{total || '?'}</Text>
            <Text color={C.dim}>{active ? `  now ${active.slug}` : ''}{v.preset ? `  · ${v.preset}` : ''}</Text>
          </Text>
        ) : (
          <Text color={C.dim}>{armed && pending ? 'running intake · .missions/ appears after the spec' : 'start one with /mission <goal>'}</Text>
        )}
        <Box gap={1}><Text color={C.dim}>model</Text>{picker('orchestrator', C.main)}</Box>
      </Box>
    )

    // ---- reviewer card: a timeline of verdicts across the mission
    const reviews = v?.reviews ?? []
    const trackW = Math.max(10, inner)
    const marks = new Map<number, { glyph: string; color: string }>()
    if (v) for (const r of reviews) {
      const x = lane(Date.parse(r.at), Date.parse(r.at), Date.parse(v.startedAt), spanEnd, trackW - 1).before
      marks.set(x, r.verdict === 'PASS' ? { glyph: '◆', color: C.ok } : { glyph: '◇', color: C.warn })
    }
    const track = Array.from({ length: trackW }, (_, i) => marks.get(i))
    const lastReview = reviews.at(-1)
    const reviewerCard = (
      <Box flexDirection="column" borderStyle="round" borderColor={C.arch} paddingX={1}>
        <Box justifyContent="space-between">
          <Text color={C.arch} bold>REVIEWER · {m.reviewer}</Text>
          <Text color={C.dim}>reviews <Text color={C.arch} bold>{reviews.length}</Text></Text>
        </Box>
        <Text wrap="truncate">
          {track.map((t, i) => t ? <Text key={`t-${i}`} color={t.color} bold>{t.glyph}</Text> : <Text key={`t-${i}`} color={C.arch}>─</Text>)}
        </Text>
        <Text color={C.dim} wrap="truncate">
          {lastReview
            ? <Text>last <Text color={lastReview.verdict === 'PASS' ? C.ok : C.warn} bold>phase {lastReview.phase} {lastReview.verdict}</Text> · {timer(nowMs - Date.parse(lastReview.at))} ago</Text>
            : 'no reviews yet'}
        </Text>
        <Text wrap="truncate">
          {(v?.phases ?? []).map(p => (
            <Text key={`ph-${p.n}`} color={p.verdict === 'PASS' ? C.ok : p.verdict === 'FAIL' ? C.warn : C.dim}>
              {p.verdict === 'PASS' ? '◆' : '◇'} {shorten(p.slug, narrow ? 8 : 14)}{'  '}
            </Text>
          ))}
        </Text>
        <Box gap={1}><Text color={C.dim}>model</Text>{picker('reviewer', C.arch)}</Box>
      </Box>
    )

    // ---- workers: swimlanes on a track spanning the whole mission
    const ws = v?.workers ?? []
    const running = ws.filter(w => w.state === 'running').length
    const labelW = Math.min(18, Math.max(10, Math.floor(cols / 4)))
    const laneW = Math.max(8, cols - labelW - 12)
    const workerColor = (w: { state: string }) => (w.state === 'blocked' ? C.warn : w.state === 'done' ? C.ok : C.agent)
    const workersSection = (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold wrap="truncate">workers · {running} running · {ws.length} total</Text>
        </Box>
        <Box gap={1}><Text color={C.dim}>model</Text>{picker('worker', C.agent)}</Box>
        {ws.length === 0 && <Text color={C.faint}>none dispatched yet</Text>}
        {v && ws.map((w, i) => {
          const from = Date.parse(w.startedAt)
          const to = w.endedAt ? Date.parse(w.endedAt) : nowMs
          const g = lane(from, to, Date.parse(v.startedAt), spanEnd, laneW)
          const color = workerColor(w)
          return (
            <Box key={`lane-${w.id}`} flexDirection="column">
              <Box>
                <Text color={color}>{w.state === 'done' ? '✓' : w.state === 'blocked' ? '✕' : '●'} </Text>
                <Box width={labelW} flexShrink={0}><Text wrap="truncate">{i + 1}: {w.task || w.id}</Text></Box>
                <Text color={C.faint}>{' ' + '·'.repeat(g.before)}</Text>
                <Text color={color}>{'━'.repeat(g.bar)}</Text>
                <Text color={C.faint}>{'·'.repeat(g.after) + ' '}</Text>
                <Text color={C.dim}>{timer(to - from)}</Text>
              </Box>
              {w.state === 'running' && (
                <Box paddingLeft={2}>
                  <Gauge percent={w.percent} width={8} color={C.agent} />
                  <Text color={C.dim} wrap="truncate-end"> {w.percent}% · {w.current}</Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )

    // ---- status strip, like flightdeck's last-turn card
    const retries = v ? reviews.filter(r => r.verdict === 'FAIL').length : 0
    const strip = v && (
      <Box borderStyle="round" borderColor={statusColor} paddingX={1}>
        <Text wrap="truncate">
          <Text color={statusColor}>{v.status === 'complete' ? '✓' : v.status === 'aborted' ? '✕' : '◐'} </Text>
          <Text>{v.status === 'running' ? `${narrow ? 'ph' : 'phase'} ${active?.n ?? passed + 1}` : v.status} · {ws.length}{narrow ? 'w' : ' workers'} · {reviews.length}{narrow ? 'r' : ' reviews'} · </Text>
          <Text color={retries ? C.amber : C.dim}>{retries}{narrow ? '↻' : retries === 1 ? ' retry' : ' retries'}</Text>
        </Text>
      </Box>
    )

    // ---- mission log card
    const roleColor = { orchestrator: C.main, worker: C.agent, reviewer: C.arch, system: C.dim }
    const used = 24 + ws.length * 2
    const room = Math.max(4, rows - used)
    const lines = (v?.updates ?? []).slice(-room)
    const logCard = (
      <Box flexDirection="column" borderStyle="round" borderColor={C.faint} paddingX={1}>
        <Text color={C.dim}>mission log</Text>
        {lines.length === 0 && <Text color={C.faint}>nothing yet</Text>}
        {lines.map((l, i) => (
          <Box key={`log-${i}`}>
            <Box width={narrow ? 6 : 9} flexShrink={0}><Text color={C.faint}>{narrow ? hms(l.at).slice(0, 5) : hms(l.at)}</Text></Box>
            <Box width={narrow ? 8 : 14} flexShrink={0}><Text color={roleColor[l.role]} bold wrap="truncate">{l.who}</Text></Box>
            <Text color={l.tone === 'warn' ? C.warn : l.tone === 'ok' ? C.ok : C.text} wrap="truncate">{l.text}</Text>
          </Box>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {titleBar}
        {orchestratorCard}
        <Divider />
        {reviewerCard}
        <Divider />
        {workersSection}
        {strip}
        {logCard}
        {armed && <Button key="stop" plain label="stop routing" onPress={() => void update($, isArmed, () => false)} />}
      </Box>
    )
  })
}
