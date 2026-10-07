export type ModelAlias = 'fable' | 'opus' | 'sonnet' | 'haiku'
export type Models = { orchestrator: ModelAlias | 'session'; worker: ModelAlias; reviewer: ModelAlias }

export type Worker = {
  id: string; phase: number; task: string; model: string; subagent: string
  percent: number; current: string; state: 'running' | 'done' | 'blocked'
  startedAt: string; endedAt: string
}
export type Phase = { n: number; slug: string; verdict: string }
export type Review = { phase: number; verdict: string; at: string }
export type LogLine = { at: string; who: string; role: 'orchestrator' | 'worker' | 'reviewer' | 'system'; text: string; tone: 'ok' | 'warn' | 'info' }
export type MissionView = {
  id: string; status: 'running' | 'complete' | 'aborted'; startedAt: string; endedAt: string; preset: string
  totalPhases: number; phases: Phase[]; workers: Worker[]; reviews: Review[]; updates: LogLine[]
}

declare module 'claude-code' {
  interface PluginState {
    mission: { models: Models; view: MissionView | null; isArmed: boolean; goal: string; now: number }
  }
}
