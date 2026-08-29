# Shared: Tracker Detection

Run once at Phase 0 of every mode. Store results as session variables.

## Step 1 — Resolve `TRACKER`

Inspect `.claude/skills/qa-agent/config.json`:
- `linear_team` is a non-empty string → `TRACKER=linear`
- `jira_domain` AND `jira_project` are both non-empty strings → `TRACKER=jira`
- Both sets present → stop with `⛔ Config has both Jira and Linear keys set. Run /qa-agent config edit to remove the unused tracker's keys before continuing.`
- Neither populated → `TRACKER=none`. Every qa-agent mode requires a tracker — stop with `⛔ No tracker configured. Run /qa-agent config to set up Jira or Linear.`

## Step 2 — Resolve tracker-specific session variables

**If `TRACKER=jira`:**
- `JIRA_PROJECTS` — parse `jira_project`, split on `,`, trim, drop empty.
- `JIRA_PROJECT_CLAUSE` — single token → `project = KEY` | multiple → `project in (KEY1, KEY2)`.
- `JIRA_CLOUD_ID` — equal to `jira_domain` for all Atlassian MCP calls.
- Store `qa_ready_state`, `qa_passed_state`, `qa_failed_state` as `QA_READY_STATE`, `QA_PASSED_STATE`, `QA_FAILED_STATE`.

**If `TRACKER=linear`:**
- `LINEAR_TEAM_NAME` — equal to `linear_team`.
- `LINEAR_TEAM_ID` — resolve once per session via `Linear-list_teams`. Cache. If no match: stop with `⛔ Linear team '{LINEAR_TEAM_NAME}' not found. Run /qa-agent config edit to fix linear_team.`
- `QA_READY_STATE_NAME`, `QA_PASSED_STATE_NAME`, `QA_FAILED_STATE_NAME` — equal to the corresponding config keys.
- `QA_READY_STATE_ID`, `QA_PASSED_STATE_ID`, `QA_FAILED_STATE_ID` — resolve once per session via `Linear-list_issue_statuses` filtered to `LINEAR_TEAM_ID`. Cache. If any are missing: stop with `⛔ Linear state '{NAME}' not found in team '{LINEAR_TEAM_NAME}'. Run /qa-agent config edit to fix it.`

## Step 3 — Tracker MCP pre-flight

Modes that require a tracker MCP perform a pre-flight check at Phase 0 (after Step 2):
- `TRACKER=jira` → fetch project metadata for the first key in `JIRA_PROJECTS` (cloudId = `JIRA_CLOUD_ID`). On failure: `⛔ Atlassian MCP unreachable. Check authentication before continuing.`
- `TRACKER=linear` → `Linear-list_teams` (already required for Step 2 — if it succeeded there, pre-flight is satisfied).

## Step 4 — Ticket URL parsing & key extraction

| Pattern | Tracker | Extract |
|---|---|---|
| `[A-Z]+-[0-9]+` (bare key, e.g. `BRGY-23`, `BRGY-46`) | matches `TRACKER` | `TICKET_KEY` = the key as-is |
| `https?://[^/]*\.atlassian\.net/browse/([A-Z]+-[0-9]+)` | requires `TRACKER=jira` | `TICKET_KEY` = capture group 1 |
| `https?://linear\.app/[^/]+/issue/([A-Z]+-[0-9]+)(?:/.*)?` | requires `TRACKER=linear` | `TICKET_KEY` = capture group 1 |

If the URL pattern doesn't match the configured `TRACKER`: stop with `⛔ Got a {linear|jira} URL but this project is configured for {jira|linear}. Run /qa-agent config to switch trackers.`

## Step 5 — Ticket operations

Tool names below are the canonical ones used throughout this skill. If an MCP call fails with "unknown tool", list the available tools and match by intent rather than guessing a variant — do not invent names.

| Operation | Jira | Linear |
|---|---|---|
| Fetch ticket details | Atlassian MCP `getJiraIssue` (cloudId, key) | `Linear-get_issue` (id or identifier = `TICKET_KEY`) |
| Build URL from key | `https://{jira_domain}/browse/{TICKET_KEY}` | use the `url` field from `Linear-get_issue` |
| List tickets in `qa_ready_state` | `searchJiraIssuesUsingJql` with `{JIRA_PROJECT_CLAUSE} AND status = "{QA_READY_STATE}"` | `Linear-list_issues` with `team=LINEAR_TEAM_ID, state=QA_READY_STATE_ID` |
| Transition to passed | `transitionJiraIssue` to `QA_PASSED_STATE` | `Linear-save_issue` with `id=TICKET_KEY, stateId=QA_PASSED_STATE_ID` |
| Transition to failed | `transitionJiraIssue` to `QA_FAILED_STATE` | `Linear-save_issue` with `id=TICKET_KEY, stateId=QA_FAILED_STATE_ID` |
| Post comment | `addCommentToJiraIssue` | `Linear-create_comment` with `issueId=TICKET_KEY` |
| Update ticket description | `editJiraIssue` | `Linear-save_issue` with `id=TICKET_KEY, description=...` |
| Search for duplicate bugs | `searchJiraIssuesUsingJql` with sanitized summary | `Linear-list_issues` with `team=LINEAR_TEAM_ID` and a `query` parameter |
| Create new bug ticket | `createJiraIssue` with project = first `JIRA_PROJECTS` key | `Linear-save_issue` with `teamId=LINEAR_TEAM_ID` |

When a mode references "fetch the ticket", "transition", "comment", or "file a bug", it always means "the operation in this table for the resolved `TRACKER`".
