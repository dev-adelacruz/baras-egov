# bug

Triages a reported issue and (if real) files a well-formed bug ticket. Tries to reproduce the report, classifies it, and on confirmed-bug fills out a structured ticket with repro steps, expected vs. actual, environment, severity, screenshots, console/network logs, and a duplicate search.

## When to use

- A user, customer, or teammate reports an issue and you want to triage + file in one step
- You see a bug in the wild (Slack thread, screenshot, log line) and want to formalize it
- A failed `verify` run already auto-files; this mode handles standalone bug intake

## Usage

```
/qa-agent bug "[description of the issue]"
/qa-agent bug --from-slack [Slack message URL]
/qa-agent bug --from-screenshot [path-to-image]
/qa-agent bug --from-log [path-to-log-file]
/qa-agent bug "[description]" --env staging
```

```
/qa-agent bug "Save button on /listings/new redirects to homepage instead of saving"
/qa-agent bug --from-slack https://your-org.slack.com/archives/C123/p17480000000123
/qa-agent bug "OAuth callback returns 500 on staging only" --env staging
```

## Classification outcomes

| Result | Meaning | Action |
|---|---|---|
| `real_bug` | Reproduced; matches reported symptom | File ticket |
| `user_error` | User was doing the wrong thing | Suggest a reply, do not file |
| `env_issue` | Env-config gap, not a code bug | Flag the gap, optionally file as Chore |
| `flake` | Intermittent — repro succeeds only sometimes | Recommend stabilize / quarantine |
| `cannot_reproduce` | Couldn't trigger the symptom | Ask reporter for more info |

## What happens, step by step

### 1. Setup
- Reads config, resolves tracker, env, browser availability
- For Slack / screenshot / log inputs: fetches and synthesizes a text description
- Asks one clarifying question if the report is too thin to attempt repro

### 2. Symptom extraction
Pulls structured fields from the report:
- Affected URL / page / endpoint
- User action that triggered the issue
- Expected vs. actual behavior
- Error messages, status codes
- Affected user / record IDs (if mentioned)
- Environment, browser, device

### 3. Hypothesis-driven repro
Generates 2–4 hypotheses and tries each (in ranked order, stops on first confirmation):
- Browser path (Playwright drives the failing scenario)
- API path (curl + status / body capture)
- DB path (read-only query for relevant records)

### 4. Classify
Decision table on (repro outcome × signals) → one of the five classifications above.

### 5. Branch on classification
- `user_error` / `flake` / `cannot_reproduce` → print explanation and stop
- `env_issue` → flag the env-config gap; optionally file as Chore if user confirms
- `real_bug` → continue to dedup + file

### 6. Duplicate search
Sanitizes the summary, searches the tracker for similar tickets. Shows top 5; you choose:
- A number → comments on that existing ticket; no new ticket filed
- `no` → file as a fresh bug
- `merge N` → file as a fresh bug, link as related to ticket N

### 7. File the ticket
- Severity computed via the **Severity Triage** rules (Sev 1–4)
- Body filled with structured sections: Summary / Environment / Steps / Expected / Actual / Evidence / Severity / Hypotheses
- Assignee resolved from `bug_assignee` config (`auto` → last committer; `@username` → that user; team slug → unassigned)
- Linear: priority + label `Bug`. Jira: priority + issuetype `Bug` + label `qa-agent`

### 8. Slack
Posts to `slack_channel` with severity, summary, and a link. Threads screenshots / console errors.

### 9. Save context
Writes the new bug's classification, severity, repro steps, and evidence paths to `.claude/skills/qa-agent/state/context/{NEW_BUG_KEY}.json`.

## What you'll see

```
## Bug Filed — BRGY-50
Severity: Sev 2
Classification: real_bug
Tracker URL: https://adelacruz.atlassian.net/browse/BRGY-50
Slack: https://your-org.slack.com/archives/C123/p17480001234567

Evidence:
  - .claude/skills/qa-agent/state/evidence/BRGY-50/2026...-repro-1.png
  - .claude/skills/qa-agent/state/evidence/BRGY-50/2026...-network.json

Next:
  - Dev picks up the ticket
  - When marked Ready for QA: /qa-agent verify BRGY-50 <PR>
```

## Severity heuristics

| Severity | Triggers |
|---|---|
| **Sev 1** | Outage, data loss, security breach, payments broken, all-user login broken |
| **Sev 2** | Broken core feature with no workaround; many users affected |
| **Sev 3** | Degraded UX with workaround; subset of users affected |
| **Sev 4** | Cosmetic, copy, alignment, accessibility nits, edge-case-only |

Adjustments:
- Production env + DB write side-effect → escalate to Sev 1
- Affects auth / authz / payments → escalate one level
- Hits only on a single record → demote one level

## Guardrails

- **Production is read-only** — repro attempts can read DB, never write
- **One clarifying question allowed** — if the report is too thin, asks one focused question; never spirals
- **Dedup before filing** — always searches and shows top matches before creating a new ticket
- **Don't fabricate** — if a hypothesis can't be confirmed, classifies as `cannot_reproduce` rather than guessing

## Before / After

| | Run |
|---|---|
| Before | A description, screenshot, log, or Slack URL — anything QA-shaped |
| After: `real_bug` | Ticket filed, Slack posted, dev assigned (if `auto`) |
| After: not a bug | Clear explanation in chat, no noise in tracker |
