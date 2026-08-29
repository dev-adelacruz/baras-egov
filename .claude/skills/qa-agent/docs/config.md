# config

View, edit, reset, or validate your project's qa-agent config.

## Usage

```
/qa-agent config                          ← show current values
/qa-agent config edit                     ← update specific keys interactively
/qa-agent config reset                    ← wipe and redo setup
/qa-agent config validate                 ← test connectivity for all configured integrations
/qa-agent config show-context [ticket]    ← inspect stored context for a ticket key
```

The config lives at `.claude/skills/qa-agent/config.json` in your project root. It's auto-generated the first time you run any qa-agent mode.

## Config keys

Required for every project: `version`, `repo`, `qa_ready_state`, `qa_passed_state`, `qa_failed_state`, `slack_channel`, `base_branch`, plus the active tracker's keys.

Tracker is mutually exclusive — set Jira *or* Linear keys, not both.

| Key | Tracker | Required? | Description | Example |
|---|---|---|---|---|
| `version` | both | required | Schema version — managed automatically | `1` |
| `repo` | both | required | GitHub repo in `owner/repo` format | `dev-adelacruz/baras-egov` |
| `jira_domain` | Jira-only | required (Jira) | Jira hostname, no protocol | `your-org.atlassian.net` |
| `jira_project` | Jira-only | required (Jira) | One or more Jira keys, comma-separated | `MULTI` or `MULTI,HQA` |
| `linear_team` | Linear-only | required (Linear) | Exact Linear team name | `Development` |
| `qa_ready_state` | both | required | Tracker state name meaning "Dev is done, QA take it" | `Ready for QA` |
| `qa_passed_state` | both | required | State to transition to on QA pass | `Passed QA` or `Done` |
| `qa_failed_state` | both | required | State to transition to on QA fail | `In Progress` |
| `slack_channel` | both | required | Slack channel for QA reports (no `#`) | `qa-reports` |
| `slack_group` | both | optional | Slack group handle for FAIL pings (no `@`) | `qa-eng` |
| `bug_assignee` | both | optional | `auto` / `@username` / GitHub team slug | `auto` or `@itsjms` |
| `bug_priority_default` | both | optional | Fallback severity when triage is inconclusive (1–4) | `3` |
| `local_url` | both | optional | Base URL for local | `http://localhost:3000` |
| `staging_url` | both | optional | Base URL for staging | `https://staging.example.com` |
| `production_url` | both | optional | Base URL for production | `https://example.com` |
| `e2e_framework` | both | optional | `playwright` / `cypress` / `none` (else auto-detected) | `playwright` |
| `smoke_checklist_path` | both | optional | Path to YAML checklist for smoke mode | `.claude/skills/qa-agent/smoke-checklist.yml` |
| `base_branch` | both | required | Branch name PRs target | `main` |

## What `config validate` checks

- GitHub repo accessible (`gh api repos/{REPO}`)
- Tracker MCP reachable + configured states / project keys exist
- Slack channel found
- Optional: Slack group, bug assignee, env URLs return 2xx/3xx/401, Playwright installed
- Base branch exists on remote

```
## Config Validation
✅ GitHub        — dev-adelacruz/baras-egov (accessible)
✅ Linear        — team 'Development' found, all 3 QA states exist
✅ Slack channel — #qa-reports found
⊝ Slack group   — not configured
✅ local_url     — http://localhost:3000 (200)
⊝ staging_url   — not configured
✅ Playwright    — v1.52.0 installed
✅ Base branch   — main exists on remote
```

## Sharing the config with teammates

After `config edit` or initial setup, qa-agent offers to commit the config file:
```
✅ Config saved. Commit it so teammates share the setup — shall I run:
  git add .claude/skills/qa-agent/config.json && git commit -m "chore: update qa-agent config"
```

The `.claude/skills/qa-agent/state/context/`, `.claude/skills/qa-agent/state/evidence/`, and `.claude/skills/qa-agent/state/sweep-checkpoint.json` directories / files are gitignored — only the config itself is committed.
