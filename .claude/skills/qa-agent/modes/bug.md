# Mode: bug

## Usage

```
/qa-agent bug "[description of the issue]"
/qa-agent bug --from-slack [Slack message URL]
/qa-agent bug --from-screenshot [path-to-image]
/qa-agent bug --from-log [path-to-log-file]
```

Triage and (if real) file a well-formed bug ticket. Tries to reproduce the report, classifies it, then on confirmed-bug fills out a structured ticket with repro steps, expected vs. actual, environment, severity, screenshots, console/network logs, and a duplicate search.

**Classification outcomes:**
- `real_bug` → file a ticket
- `user_error` → respond with the correct usage, do not file
- `env_issue` → flag the env-config gap, do not file (or file as Sev 4 / chore depending on impact)
- `flake` → recommend stabilization or quarantine, do not file as a bug
- `cannot_reproduce` → file a "needs more info" comment back to reporter or stop, depending on severity

**Examples:**
```
/qa-agent bug "Save button on /listings/new redirects to homepage instead of saving"
→ Tries to repro on local, classifies, files Sev 2 ticket if real

/qa-agent bug --from-slack https://your-workspace.slack.com/archives/C123/p17480000000123
→ Reads the Slack thread, extracts symptoms, tries to repro

/qa-agent bug "OAuth callback returns 500 on staging only" --env staging
→ Env-scoped repro attempt
```

---

## Phase 0 — Setup

Read config. Resolve `TRACKER` per **Shared: Tracker Detection** (Steps 1–3). Parse args:
- Free-text description → store as `REPORT_TEXT`
- `--from-slack <url>` → fetch the message + thread via Slack MCP, store concatenated text as `REPORT_TEXT`
- `--from-screenshot <path>` → store image path as `REPORT_IMAGE`, run an image-content read to derive a text description and append to `REPORT_TEXT`
- `--from-log <path>` → read the file (last 200 lines if huge), store as `REPORT_TEXT`
- `--env <name>` → store as `ENV` (default: `local`)

Resolve env per **Shared: Environment Resolution** — store `ENV_BASE_URL`, `DB_QUERY_CMD`.

Run **Shared: Test Stack Detection** (cached if context exists for a related ticket).
Run **Shared: Browser Driver** pre-flight. Store `BROWSER_AVAILABLE`.

**Print Session State**:
```
## Session State
TRACKER={value} | ENV={value} | ENV_BASE_URL={value}
INPUT_SOURCE={text|slack|screenshot|log} | BROWSER_AVAILABLE={true|false}
```

## Phase 1 — Extract Symptoms

```xml
<analysis>
  <context>
    What is the user describing? Extract:
      - Affected URL / page / endpoint / feature
      - User action that triggered the issue
      - Expected behavior (what the user thought would happen)
      - Actual behavior (what did happen)
      - Error messages / status codes / screenshots referenced
      - Affected user / account / record IDs (if mentioned)
      - Environment (local / staging / production)
      - Browser / device (if mentioned)
  </context>
  <files>
    Read at most 3 likely-affected files to ground hypotheses. Do not modify.
  </files>
  <task>
    Synthesize a structured symptom record. Generate 2–4 hypotheses for the root cause.
    For each hypothesis, propose a concrete repro: a sequence of steps that, if reproduced, confirms or rules out that hypothesis.
  </task>
  <constraints>
    - Don't invent details the report doesn't support. If the URL is missing, ask one clarifying question rather than guessing.
    - Hypotheses ranked by likelihood given the symptoms.
  </constraints>
</analysis>
```

If the symptoms are too thin to attempt repro (no URL, no clear action, no error message), ask **one** clarifying question to the user before proceeding. Acceptable formats:
- "What URL or page were you on?"
- "What did you click / submit?"
- "Can you paste the exact error message or a screenshot?"

## Phase 2 — Attempt Reproduction

For each hypothesis (in ranked order, stop on first confirmation):

1. **Browser path** (if `BROWSER_AVAILABLE=true`): build a driver config per **Shared: Browser Driver** and run it. Encode the repro as a `steps` array — this is what makes a repro reproducible by someone else later. Write to `/tmp/qa-agent-driver-repro-{N}.json`:

   ```json
   {
     "baseUrl": "{ENV_BASE_URL}",
     "ticket": "repro-{N}",
     "evidenceDir": ".claude/skills/qa-agent/state/evidence/repro-{timestamp}",
     "login": { "...from config.browser_login if the repro needs a signed-in user..." },
     "urls": [
       {
         "name": "repro-attempt-{N}",
         "path": "{page from the report}",
         "settleMs": 500,
         "steps": [
           { "action": "fill",       "selector": "{field}", "value": "{value from the report}" },
           { "action": "click",      "selector": "{the control the user pressed}" },
           { "action": "expectText", "text": "{what the user expected to see}" }
         ]
       }
     ]
   }
   ```

   ```bash
   node .claude/skills/qa-agent/scripts/playwright-driver.cjs \
     --config /tmp/qa-agent-driver-repro-{N}.json \
     > /tmp/qa-agent-driver-repro-{N}-result.json
   ```

   Read the result JSON. The `failures[]` array, `consoleErrors`, `badResponses`, `requestFailures` and `pageErrorSample` fields ARE the evidence — quote them verbatim into the ticket rather than paraphrasing. The `-step-failure.png` screenshot shows the DOM at the moment it broke.

   Interpreting the outcome:
   - Driver `FAIL` with failures matching the reported symptom → **reproduced**
   - Driver `FAIL` with unrelated failures → note both; the report may be a different bug than the one you found
   - Driver `PASS` → **not reproduced on this path**; move to the next hypothesis
   - Exit 2 → could not run (login failed / Playwright missing) → `cannot_reproduce` with the blocker named

2. **API path** (if no UI surface): hit the endpoint with `curl` against `ENV_BASE_URL` and capture status + body (truncated to 1000 chars).
3. **DB path** (if data-related): run a read-only query via `DB_QUERY_CMD` to inspect the relevant record(s).
4. Capture: did the repro produce the reported symptom? Yes / No / Partially.

Record per-attempt outcomes. Stop after the first confirmed reproduction OR after exhausting all hypotheses.

If `BROWSER_AVAILABLE=false`, say so explicitly in the triage result. "Could not reproduce" and "could not attempt" are different claims, and conflating them sends a real bug back to the reporter as user error.

## Phase 3 — Classify

Apply this decision table:

| Repro outcome | Other signals | Classification |
|---|---|---|
| Confirmed (matches report exactly) | New change in PR diff or recent deploy | `real_bug` |
| Confirmed | Environment-only (staging works, prod doesn't, or vice versa with no code diff) | `env_issue` |
| Confirmed only intermittently across re-runs | Test flake history exists OR repro requires specific timing | `flake` |
| Not reproduced | Documented feature behavior that matches "actual" | `user_error` |
| Not reproduced | Description was clear but couldn't trigger | `cannot_reproduce` |
| Couldn't run repro | Browser unavailable / env down / missing test data | `cannot_reproduce` (with note) |

## Phase 4 — Branch on Classification

### `user_error`
Print:
```
## Triage Result — User Error
Classification: 🟢 Not a bug
Explanation: {what the user was likely doing vs. how the feature is intended to work}
Suggested response: {a short reply the user can paste back to the reporter}
```
No ticket filed. Stop.

### `env_issue`
If impact is high (production-affecting, blocks users): file as Sev 1 or Sev 2 with the type set to `Chore` / `Infrastructure` (not `Bug`). Otherwise:
```
## Triage Result — Env Issue
Classification: 🟡 Env-config gap, not a code bug
Affected env: {env}
Recommendation: {what infra change fixes it — e.g. "OAuth redirect URI is wrong on staging"}
```
No bug ticket. Stop unless the user wants it filed as a chore.

### `flake`
```
## Triage Result — Flake
Classification: 🟡 Intermittent, likely flaky
Affected test or feature: {what}
Recommendation: stabilize / quarantine / re-run pattern
```
Optionally file a `Tech Debt` ticket if the user confirms.

### `cannot_reproduce`
- If a real ticket parent was implied (e.g. `--from-slack` of a customer report): post a comment back to the source asking for more info.
- If standalone: stop with:
  ```
  ## Triage Result — Cannot Reproduce
  Tried: {hypothesis list}
  Each result: {outcome}
  Need: {what info would unblock — exact URL, account ID, error message screenshot}
  ```

### `real_bug`
Continue to Phase 5.

## Phase 5 — Duplicate Search

Sanitize the bug summary for search:
- Strip ticket-key-style strings (`[A-Z]+-[0-9]+`)
- Strip absolute URLs
- Keep top distinguishing keywords (page name, action, error verb)

Run a duplicate search per **Shared: Tracker Detection** Step 5:
- **Linear**: `Linear-list_issues` with `team=LINEAR_TEAM_ID`, `query=<sanitized>`, limit 10
- **Jira**: `searchJiraIssuesUsingJql` with text search on the summary, limit 10

Show top 5 matches to the user with title + status + URL. Ask:
```
🔍 Found {N} similar tickets. Is this a duplicate of any?
  1. {KEY} {title} — {status}
  2. ...

Reply with:
  - the number of the duplicate (e.g. "1") to skip filing and just comment on that ticket instead
  - "no" to file as a new bug
  - "merge {N}" to file as a new bug AND link as related to ticket {N}
```

If user picks a number → comment on that ticket: "Likely duplicate report received: {summary}. Repro confirmed at {timestamp}, evidence at {paths}." Stop.

If user says "no" or "merge" → continue to Phase 6 (with the relation link if "merge").

## Phase 6 — File the Bug

Compute severity per **Shared: Severity Triage**.

Build the ticket body:
```
## Summary
{One-line description of the symptom}

## Environment
- Env: {local | staging | production}
- URL: {ENV_BASE_URL}{path}
- Browser: {if known}
- User / role: {if relevant}
- Affected record(s): {IDs if known}

## Steps to Reproduce
1. {step}
2. ...
N. {step that triggers the failure}

## Expected
{what should happen}

## Actual
{what actually happens — quote error messages exactly}

## Evidence
- Screenshot: {path}
- Console errors: {N} captured (see attachment / inline below)
- Network failures: {N} captured
- Related code: {file:line if a hypothesis confirmed it}

## Severity
Sev {1-4} — {one-line justification}

## Hypotheses (from triage)
- {hypothesis 1 — confirmed / refuted}
- ...
```

Set ticket fields per **Shared: Tracker Detection** Step 5 (Create new bug ticket):

**Linear:**
- `title` = first line of summary (truncate to 80 chars)
- `description` = the full body above
- `teamId` = `LINEAR_TEAM_ID`
- `labels` = `["Bug"]` (case-sensitive — use `Linear-list_issue_labels` to confirm exact label names; default to "Bug" / "QA")
- `priority` = mapped from severity (Sev 1 → 1 Urgent, Sev 2 → 2 High, Sev 3 → 3 Normal, Sev 4 → 4 Low)
- `assigneeId` = resolve from `bug_assignee` config:
  - `auto` → resolve via `gh log -1 --format='%ae'` for the most recent committer on the most-relevant code file (best-effort), then map email → Linear user via `Linear-list_users`. Fallback: leave unassigned.
  - `@username` → `Linear-list_users` matching the username, take first
  - team slug → leave unassigned (Linear has no team-as-assignee)
- `relatedTo` = the source ticket if "merge {N}" was selected in Phase 5

**Jira:**
- `summary` = first line of summary (truncate)
- `description` = the full body
- `project` = first key in `JIRA_PROJECTS`
- `issuetype` = `Bug`
- `priority` = mapped from severity (Sev 1 → Highest, etc.)
- `assignee` = resolved from `bug_assignee`
- `labels` = `["qa-agent"]` (so we can find them later)

Capture the new ticket's key as `NEW_BUG_KEY` and URL as `NEW_BUG_URL`.

## Phase 7 — Post to Slack

Post per **Shared: Slack Thread** to `slack_channel`:
```
🐛 New bug filed — {NEW_BUG_KEY}
Severity: Sev {1-4}
{summary}
Ticket: {NEW_BUG_URL}
```

Thread reply with screenshots / console-errors / network-failures snippets.

## Phase 8 — Write Context

Write per **Shared: Session Context** — `bug` key:
- `classification` (`real_bug`)
- `filed_ticket` = `NEW_BUG_KEY`
- `severity` = numeric 1–4
- `repro_steps` = array of strings
- `evidence` = array of paths
- `timestamp`

Use the new bug's key as the context filename (`{NEW_BUG_KEY}.json`).

## Phase 9 — Final Report

```
## Bug Filed — {NEW_BUG_KEY}
Severity: Sev {1-4}
Classification: {classification}
Tracker URL: {NEW_BUG_URL}
Slack: {slack_thread_url}

Evidence:
  - {paths}

Next:
  - Dev picks up the ticket
  - When marked {QA_READY_STATE}: /qa-agent verify {NEW_BUG_KEY} <PR>
```
