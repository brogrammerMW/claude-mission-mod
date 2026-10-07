// Same look as Claude Code's own pill progress bar: filled ▰ in color, empty ▱ dimmed.
export function pill(percent: number, width: number): { fill: string; empty: string } {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width)
  return { fill: '▰'.repeat(filled), empty: '▱'.repeat(width - filled) }
}

// Mission clock: T+MM:SS under an hour, T+H:MM:SS after.
export function missionClock(startIso: string, nowMs: number): string {
  const start = Date.parse(startIso)
  if (Number.isNaN(start)) return 'T+--:--'
  const s = Math.max(0, Math.floor((nowMs - start) / 1000))
  const two = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `T+${h}:${two(m)}:${two(s % 60)}` : `T+${two(m)}:${two(s % 60)}`
}

// A section rule: "── CREW ──────────" filled to the pane width.
export function rule(label: string, width: number): { head: string; tail: string } {
  const head = `── ${label} `
  return { head, tail: '─'.repeat(Math.max(2, width - head.length)) }
}

// "20261006-jev-explainer-html-e6e5a6e6" → name "jev-explainer-html", tag "e6e5a6e6"
export function splitId(id: string): { name: string; tag: string } {
  const parts = id.split('-')
  const hasDate = /^\d{8}$/.test(parts[0] ?? '')
  const hasTag = parts.length > 2 && /^[0-9a-f]{8}$/.test(parts.at(-1) ?? '')
  const name = parts.slice(hasDate ? 1 : 0, hasTag ? -1 : undefined).join('-')
  return { name: name || id, tag: hasTag ? parts.at(-1)! : '' }
}

// A swimlane: where a bar sits on a track spanning the whole mission, in cells.
export function lane(fromMs: number, toMs: number, spanStart: number, spanEnd: number, width: number) {
  const span = Math.max(1, spanEnd - spanStart)
  const at = (t: number) => Math.round(((Math.min(Math.max(t, spanStart), spanEnd) - spanStart) / span) * width)
  const before = Math.min(width - 1, at(fromMs))
  const bar = Math.max(1, Math.min(width - before, at(toMs) - before))
  return { before, bar, after: width - before - bar }
}

// Elapsed as m:ss, or h:mm past an hour.
export function timer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

// "2026-10-07T00:10:52Z" → "20:10:52" on a New York machine: the computer's own time zone.
export function hms(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

export const shorten = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
