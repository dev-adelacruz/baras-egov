# Shared: Config System

Load this file when a mode needs to read, validate, or set up config — i.e. at Phase 0 of every mode, and for all `/qa-agent config` subcommands.

## Config File

`.claude/skills/qa-agent/config.json` in project root. Committed to the repo so teammates share the setup (see **Committing the skill** below — the skill directory must actually be tracked for this to be true).

The file holds either Jira keys **or** Linear keys, not both. Tracker is auto-detected from which keys are present (see `references/tracker.md`).

**Linear example:**
```json
{
  "version": 1,
  "repo": "owner/repo",
  "linear_team": "Development",
  "qa_ready_state": "Ready for QA",
  "qa_passed_state": "Passed QA",
  "qa_failed_state": "In Progress",
  "slack_channel": "qa-reports",
  "slack_group": "qa-eng",
  "bug_assignee": "auto",
  "bug_priority_default": 3,
  "local_url": "http://localhost:3000",
  "staging_url": "https://staging.example.com",
  "production_url": "https://example.com",
  "e2e_framework": "playwright",
  "smoke_checklist_path": ".claude/skills/qa-agent/smoke-checklist.yml",
  "base_branch": "main"
}
```

**Jira example:**
```json
{
  "version": 1,
  "repo": "owner/repo",
  "jira_domain": "your-org.atlassian.net",
  "jira_project": "MULTI,HQA",
  "qa_ready_state": "Ready for QA",
  "qa_passed_state": "Done",
  "qa_failed_state": "In Progress",
  "slack_channel": "qa-reports",
  "bug_assignee": "@itsjms",
  "bug_priority_default": 3,
  "local_url": "http://localhost:3000",
  "staging_url": "https://staging.example.com",
  "production_url": "https://example.com",
  "e2e_framework": "playwright",
  "base_branch": "main"
}
```

## Known Config Keys

Keys marked **Jira-only** or **Linear-only** are mutually exclusive. Keys marked **optional** can be omitted; modes that depend on them gracefully degrade (skip the related action and note it in their report).

| Key | Tracker | Required? | Format | Example |
|---|---|---|---|---|
| `version` | both | required | integer — managed automatically | `1` |
| `repo` | both | required | `owner/repo` — exactly one `/` | `dev-adelacruz/baras-egov` |
| `jira_domain` | Jira-only | required (Jira) | hostname only, no protocol | `your-org.atlassian.net` |
| `jira_project` | Jira-only | required (Jira) | one or more uppercase keys, comma-separated | `MULTI` or `MULTI,HQA` |
| `linear_team` | Linear-only | required (Linear) | exact Linear team name (case-sensitive) | `Development` |
| `qa_ready_state` | both | required | exact tracker workflow state name that means "Dev is done, QA take it" | `Ready for QA` |
| `qa_passed_state` | both | required | exact state name to transition to on QA pass | `Passed QA` or `Done` |
| `qa_failed_state` | both | required | exact state name to transition to on QA fail | `In Progress` |
| `slack_channel` | both | optional | channel name (no `#` prefix) or channel ID (e.g. `C0B1KEBJF24`). Omit or leave blank to disable Slack posting entirely — QA works fine without it. | `qa-reports` or `C0B1KEBJF24` |
| `slack_thread_ts` | both | optional | parent message timestamp in `nnnnnnnnnn.nnnnnn` format. When set, all qa-agent output threads under this single message instead of posting new parents per verdict. | `1777817464.885489` |
| `slack_group` | both | optional | handle, no `@` | `qa-eng` |
| `bug_assignee` | both | optional | `@username` / GitHub team slug / `auto` (= last committer on the relevant file) | `auto` or `@itsjms` |
| `bug_priority_default` | both | optional | integer 1–4 (1=Sev1, 4=Sev4) used when triage is inconclusive | `3` |
| `local_url` | both | optional | base URL for local env, with protocol | `http://localhost:3000` |
| `staging_url` | both | optional | base URL for staging, with protocol | `https://staging.example.com` |
| `production_url` | both | optional | base URL for production, with protocol | `https://example.com` |
| `e2e_framework` | both | optional | `playwright` / `cypress` / `none` (auto-detected from package.json with this as override) | `playwright` |
| `smoke_checklist_path` | both | optional | relative path to a YAML/MD file enumerating smoke checks | `.claude/skills/qa-agent/smoke-checklist.yml` |
| `browser_login` | both | optional | object passed straight through to the driver's `login` block for auth-gated verification. See `references/browser-driver.md` → **Login**. Store credentials for a dedicated QA test account only — never a real user's. | `{"path": "/users/sign_in", ...}` |
| `base_branch` | both | required | exact branch name | `main` |

## First Run Detection

At Phase 0 of every mode: read `.claude/skills/qa-agent/config.json` if it exists.

1. If file missing entirely → run **Config Setup** (all required keys for the chosen tracker; optional keys are offered but skippable), then write file with `"version": 1`.
2. If file exists → resolve tracker per `references/tracker.md`. Determine the **expected required-key set** for that tracker:
   - Tracker = `jira` → required: `repo`, `jira_domain`, `jira_project`, `qa_ready_state`, `qa_passed_state`, `qa_failed_state`, `base_branch`
   - Tracker = `linear` → required: `repo`, `linear_team`, `qa_ready_state`, `qa_passed_state`, `qa_failed_state`, `base_branch`
   - Tracker = `none` → no tracker keys are populated; treat as a fresh setup and run **Config Setup**.
3. Diff the expected required-key set against the file:
   - Some required keys missing → run **Config Setup** for missing keys only, preserve existing values.
   - All required keys present → proceed (do **not** prompt for missing optional keys; treat their absence as "user opted out").

## Config Setup

**Step 1 — Pick tracker.** If neither `jira_domain`/`jira_project` nor `linear_team` is set:
```
👋 qa-agent needs to know which ticket tracker this project uses.

  1. Jira (Atlassian)
  2. Linear

Reply with `jira` or `linear`.
```
If existing config already has Jira keys → tracker is `jira`, skip this prompt. If existing config has `linear_team` → tracker is `linear`, skip this prompt. If both somehow exist: stop with `⛔ Config has both Jira and Linear keys set. Run /qa-agent config edit to remove the unused tracker's keys before continuing.`

**Step 2 — Show preamble.** Once the tracker is known, list all required keys still needing values, then ask for each one at a time in the order in the table above (skipping keys not relevant to the chosen tracker). Validate per-key as the user enters values:

**Required keys:**
- `repo`: must match `[^/]+/[^/]+` (exactly one `/`).
- `jira_domain` (Jira only): must not contain `://` or spaces.
- `jira_project` (Jira only): split on `,`, trim whitespace, drop empty tokens. Each remaining token must match `[A-Z][A-Z0-9]+`. Re-join with `,` (no spaces) before saving.
- `linear_team` (Linear only): non-empty string. Verify against `Linear-list_teams` — if the call succeeds, the entered name must match a team name exactly. On no match: re-prompt with available team names. If the call fails: warn "Could not reach Linear MCP to verify team '{value}'. Accept this value anyway? (yes / re-enter)" — accept on `yes`.
- `qa_ready_state`, `qa_passed_state`, `qa_failed_state`: non-empty strings. For Linear, verify against `Linear-list_issue_statuses` filtered to the resolved team — re-prompt with the available state names on no match. For Jira, verify against the project's transition list — re-prompt on no match. If the verification call fails, warn and accept on confirmation.
- `base_branch`: run `git ls-remote --heads origin {value}` — accept only if the branch exists on the remote (or the user confirms they want to bypass the check on a network failure).

**Optional keys** (blank input is accepted and means "omit from the file"):
- `slack_thread_ts`: if non-blank, must match `^\d{10}\.\d{6}$` (Slack ts format). When set, the skill posts all output as replies in this thread (see `references/slack.md` → Mode B) instead of creating a new parent per verdict. Verify the thread exists by calling `slack_read_thread` with `channel_id={slack_channel}` and `message_ts={slack_thread_ts}` — re-prompt on not-found. Tip: extract from a Slack permalink like `.../archives/{channel}/p1777817464885489` by splitting after `p` and inserting a `.` before the last 6 digits.
- `slack_channel`: if non-blank, a channel name or ID. Blank means Slack posting is skipped everywhere, with one `⊝ Slack not configured` note per report — not an error, and never a reason to abort a run.
- `slack_group`: if non-blank, must be a Slack group handle (no `@` prefix).
- `bug_assignee`: if non-blank, must be `auto`, `@username`, or a GitHub team slug. For `@username`, verify via `gh api users/{name} --jq '.type'` returns `User`. For team slugs, verify via `gh api orgs/{owner-from-repo}/teams/{slug}` returns 200. Warn and accept on confirmation if verification fails.
- `bug_priority_default`: if non-blank, must be an integer in 1–4.
- `local_url`, `staging_url`, `production_url`: if non-blank, must start with `http://` or `https://`.
- `e2e_framework`: if non-blank, must be one of `playwright`, `cypress`, `none`. Default: leave blank — modes will auto-detect from `package.json`.
- `smoke_checklist_path`: if non-blank, the file does not need to exist yet (smoke mode will create a starter file when first run).
- `browser_login`: skip during interactive setup unless the user asks for it. Prompt separately:
  ```
  🔐 Auth-gated pages can only be verified if qa-agent can log in.
     Without this, every logged-in surface returns ⏸ BLOCKED.
     Set up browser_login now? (yes / skip)
  ```
  On `yes`, collect `path`, the field selector→value map, `submit` selector, and an optional `expectText`. Warn explicitly: **these credentials are written to a committed file — use a dedicated QA account with no production data access, never a real user's login.** If the user has any doubt, tell them to skip and pass cookies per-run instead.

Write `.claude/skills/qa-agent/config.json` (merge with any existing valid keys — never overwrite values that weren't re-prompted). For optional keys explicitly skipped: omit the key entirely.

Offer to commit:
```
✅ Config saved. Commit it so teammates share the setup — shall I run:
  git add .claude/skills/qa-agent/config.json && git commit -m "chore: add qa-agent config"
Reply 'yes' to commit or 'no' to skip.
```

## Config Usage

Every mode reads all values from `.claude/skills/qa-agent/config.json`. Never hardcode or infer. Store `repo` as `REPO`. For Jira projects, use `jira_domain` as `cloudId` for all Atlassian MCP calls. For Linear projects, see `references/tracker.md`.

## Committing the skill

State is kept out of git by `.claude/skills/qa-agent/.gitignore`, which ignores `state/` (plus `.DS_Store` and `*.bak`) for everything under the skill directory. Nothing is written to the project's root `.gitignore` — the skill is self-contained.

For `config.json` and `smoke-checklist.yml` to actually be shared with teammates, the skill directory must be tracked. Verify with:
```bash
git ls-files .claude/skills/qa-agent | head
```
If that returns nothing, the skill is untracked and every "committed" claim in this doc is aspirational. Fix with:
```bash
git add .claude/skills/qa-agent && git status --short .claude/skills/qa-agent
```
Confirm `state/` does not appear in the staged list before committing.

## Utility: qa-agent config

```
/qa-agent config                          ← show current config
/qa-agent config edit                     ← update specific values interactively
/qa-agent config reset                    ← wipe and redo setup
/qa-agent config validate                 ← test connectivity for all configured integrations
/qa-agent config show-context [ticket]    ← inspect stored context for a ticket key
```

**Show:** display all key-value pairs from `.claude/skills/qa-agent/config.json` in a table. Redact `browser_login.fields` values as `***`. If missing: "No config found. Run any qa-agent mode to trigger setup."

**Edit:** display the full key list with current values and expected formats. Ask which keys to update by name or number. For each: show current → prompt for new → validate → write. Offer to commit after saving.

**Reset:** confirm first ("⚠️ This will delete your config and any sweep checkpoint. Reply 'yes' to confirm."). On yes: delete `.claude/skills/qa-agent/config.json` and `.claude/skills/qa-agent/state/sweep-checkpoint.json` if present, then run Config Setup from scratch.

**Validate:** resolve `TRACKER` per `references/tracker.md`, then test each integration with a lightweight read-only call:

- GitHub repo: `gh api repos/{REPO}` — expect 200
- Tracker (Jira): for each project key in `{jira_project}`, fetch project details — expect success
- Tracker (Linear): `Linear-list_teams` — expect a team matching `{linear_team}`. Then `Linear-list_issue_statuses` for that team — expect each of `qa_ready_state`, `qa_passed_state`, `qa_failed_state` to exist.
- Slack channel (optional): if set, look up `{slack_channel}` via Slack MCP — expect found. If blank/unset: `⊝ skipped (Slack disabled)`.
- Slack pinned thread (optional): if `slack_thread_ts` is set, call `slack_read_thread` with the configured channel + ts — expect the parent message to exist. If unset: `⊝ skipped (channel mode)`.
- Slack group (optional): if set, look up — expect found. If unset: `⊝ skipped (not configured)`.
- Bug assignee (optional): if `@username`, verify via `gh api users/{name}`. If team slug, verify via `gh api orgs/{owner}/teams/{slug}`. If `auto`: skip with note.
- Env URLs (optional, each independent): for any URL set, run `curl -s -o /dev/null -w "%{http_code}"`. Expect 2xx, 3xx, or 401 (acceptable — auth-gated home page).
- Playwright: `npx playwright --version` — expect non-zero exit only if missing.
- Browser login (optional): if `browser_login` is set, run the driver against `local_url` with that login block and a single trivial URL. Expect exit 0. On exit 2, report the driver's error message — a stale QA password is the most common cause of an all-BLOCKED verify run.
- Base branch: `git ls-remote --heads origin {base_branch}` — expect non-empty.
- Skill tracked in git: `git ls-files .claude/skills/qa-agent | head -1` — expect non-empty, else warn `⚠️ Skill is untracked — config.json is NOT shared with teammates.`

Report pass/fail per integration:
```
## Config Validation
✅ GitHub        — dev-adelacruz/baras-egov (accessible)
✅ Linear        — team 'Development' found, all 3 QA states exist
✅ Slack channel — #qa-reports found
✅ Pinned thread — parent message exists in C0B1KEBJF24
⊝ Slack group   — not configured
✅ Bug assignee  — auto (resolves at file time)
✅ local_url     — http://localhost:3000 (200)
⊝ staging_url   — not configured
⊝ production_url — not configured
✅ Playwright    — v1.62.1 installed
✅ Browser login — signed in as qa-test@example.com
✅ Base branch   — main exists on remote
✅ Git tracking  — skill is tracked (config.json shared)
```

**Show-context:** display the stored context for a given ticket key. With no key: list all `.claude/skills/qa-agent/state/context/` files with their ticket key, last-modified time, and which keys are present. With a key: read and display a human-readable summary (qa_plan summary, verify verdict, bug filed, review verdict).
