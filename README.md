# mission

A Claude Code mod that runs [mission-skill](#requirements) missions with a live **Mission** pane and per-role Claude model routing.

- **Pane:** a status bar, an orchestrator card, a reviewer timeline, worker swimlanes with progress, and a mission log. It docks at a quarter of the terminal width and switches to compact labels when narrow. Log times show in your computer's time zone.
- **Routing:** while a mission runs, the orchestrator, workers and validator each run on the model you pick in the pane (Fable, Opus, Sonnet or Haiku). Only real mission workers and validators are rerouted; other agents keep their own model.

## Install

```
/plugin install mission --marketplace brogrammerMW/mission-mod
```

Answer `y` to add the marketplace, then pick a scope.

## Use

| Command | What it does |
| --- | --- |
| `/mission` | Opens the pane as a viewer of the latest mission in `.missions/` |
| `/mission <goal>` | Turns routing on and starts a mission-skill mission for the goal |
| `/mission stop` | Turns routing off; the pane stays open |

Change each role's model from the pickers in the pane. Your choices are kept across sessions.

## Requirements

- Claude Code with mods (plugin hooks) support.
- A `mission-skill` skill that writes its progress to `.missions/<id>/log.jsonl`. The pane reads that log; without it, the pane shows standby.

## Develop

```
claude plugin validate .
claude plugin test .
```

## Credits

See [NOTICE.md](NOTICE.md).
