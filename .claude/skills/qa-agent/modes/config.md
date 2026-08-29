# Mode: config

## Usage

```
/qa-agent config                          ← show current config
/qa-agent config edit                     ← update specific values interactively
/qa-agent config reset                    ← wipe and redo setup
/qa-agent config validate                 ← test connectivity for all configured integrations
/qa-agent config show-context [ticket]    ← inspect stored context for a ticket key
```

The behavior of each subcommand is fully specified in `SKILL.md` under **Utility: qa-agent config**. This file exists so the mode router has a target to read; the actual logic lives in the shared utility.

---

## Phase 0 — Detect Subcommand

Parse argv:
- No args → `SUBCMD=show`
- `edit` → `SUBCMD=edit`
- `reset` → `SUBCMD=reset`
- `validate` → `SUBCMD=validate`
- `show-context [ticket]` → `SUBCMD=show-context`, `TICKET_KEY=ticket-or-empty`

Anything else → print usage block above and stop.

## Phase 1 — Execute

Dispatch to the appropriate utility section:

| `SUBCMD` | Implementation |
|---|---|
| `show` | **SKILL.md → Utility: qa-agent config → Show** |
| `edit` | **SKILL.md → Utility: qa-agent config → Edit** |
| `reset` | **SKILL.md → Utility: qa-agent config → Reset** |
| `validate` | **SKILL.md → Utility: qa-agent config → Validate** |
| `show-context` | **SKILL.md → Utility: qa-agent config → Show-context** |

For `validate`, follow **Shared: Tracker Detection** Steps 1–2 first to resolve the tracker, then run the per-integration checks.

For `edit` and `reset`, after writing the new config, offer the commit prompt:
```
✅ Config saved. Commit it so teammates share the setup — shall I run:
  git add .claude/skills/qa-agent/config.json && git commit -m "chore: update qa-agent config"
Reply 'yes' to commit or 'no' to skip.
```

## Phase 2 — Report

Print the result block as specified per subcommand in `SKILL.md`. No Session Context write — config is not ticket-scoped.
