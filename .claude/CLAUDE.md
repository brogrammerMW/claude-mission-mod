# claude-mission-mod

Claude Code mod for mission-skill missions: a live Mission pane and per-role model routing. Log parsing in `hooks/summary.ts`, formatting in `hooks/format.ts` (both tested), engine wiring and drawing in `hooks/register.tsx`. Check with `claude plugin validate .` and `claude plugin test .`.

## Recent Changes

### feat: mission mod with live pane and per-role model routing - 2026-10-07
- Branch: `minor/1-mission-mod`
- PR: https://github.com/brogrammerMW/claude-mission-mod/pull/2
- Summary: Mission pane (status bar, orchestrator card, reviewer timeline, worker swimlanes, mission log) drawn from the mission's log.jsonl; per-role routing of orchestrator, workers and validator to the models picked in the pane; /mission <goal> and /mission stop. Layout and palette follow claude-flightdeck (MIT).
