# smoke

Curated smoke checks against an environment. Confirms the basics: login flow works, key pages render, key API endpoints return 2xx, sentinel DB queries return data. Posts pass/fail to Slack. Used pre-deploy as a gate and post-deploy as a verification.

## When to use

- Before deploying — confirm staging is green
- After deploying — confirm production didn't regress
- On a schedule — periodic health check
- After a long incident — verify everything's back up

## Usage

```
/qa-agent smoke                          ← runs against local
/qa-agent smoke --env staging
/qa-agent smoke --env production
/qa-agent smoke --env staging --since-deploy   ← include extra "did the deploy survive" checks
```

## Smoke checks live in a YAML file

The checklist is defined in `smoke_checklist_path` from config (default: `.claude/skills/qa-agent/smoke-checklist.yml`). On first run with no file, smoke writes a starter file and asks you to review.

Each check is one of:
- **`page`** — Navigate to a path, optionally login, optionally assert text
- **`api`** — `curl` an endpoint, assert status / body substring
- **`db`** — Run a read-only query, assert row count or non-empty result

Example:
```yaml
checks:
  - name: Homepage loads
    kind: page
    path: /
    expect_text: "Welcome"

  # Needs `browser_login` in config.json — otherwise reports ⏸ BLOCKED
  # rather than running signed-out (which would falsely pass on the
  # redirect to the sign-in page).
  - name: Authenticated dashboard
    kind: page
    path: /dashboard
    auth: true
    expect_text: "Dashboard"

  # Interactive check — proves the form submits, not just that it renders.
  - name: Login form submits
    kind: page
    path: /sign_in
    steps:
      - action: fill
        selector: "#user_email"
        value: "qa-test@example.com"
      - action: fill
        selector: "#user_password"
        value: "REPLACE_ME"
      - action: click
        selector: "button[type=submit]"
      - action: expectUrl
        contains: "/dashboard"

  - name: API health
    kind: api
    path: /up
    expect_status: 200

  - name: Users table has rows
    kind: db
    query: "User.count"
    expect_count_min: 1
```

## What happens, step by step

### 1. Setup
- Reads config, resolves env base URL and DB query mechanism
- Locates smoke checklist (creates a starter on first run)
- Verifies Playwright availability for `page` checks

### 2. Run each check
- `page` checks — login if required, navigate, assert, screenshot
- `api` checks — curl, status compare, optional body match
- `db` checks — read-only query (writes refused), assert row count

Prints a one-line status per check as it runs:
```
[1/12] 🟢 Homepage loads
[2/12] 🟢 Login flow
[3/12] 🔴 /api/properties — got 500, expected 200
```

### 3. Run post-deploy extras (if `--since-deploy`)
- Asset bundle hash check (catches stale CDN serves)
- `/up` or `/health` endpoint
- Job queue depth (Sidekiq, etc.)
- Recent error rate (if Sentry / Rollbar MCP is available)

### 4. Aggregate verdict
- All main 🟢 → 🟢 PASS
- Main 🟢 + extras 🔴 → 🟡 PARTIAL
- Any main 🔴 → 🔴 FAIL
- Any ⏸ with no 🔴 → ⏸ BLOCKED

### 5. Post to Slack
Posts one line + a thread reply with details and evidence paths.

### 6. Append to history
Writes the run to `.claude/skills/qa-agent/state/smoke-history.json` (capped to last 100 entries) for trend tracking.

## What you'll see

```
## Smoke Report — staging

### Verdict
🔴 FAIL — 11/12 checks passed

### Checks
| # | Result | Kind | Name | Detail |
|---|---|---|---|---|
| 1 | 🟢 | page | Homepage loads | 200, 1.2s |
| 2 | 🟢 | page | Login flow | redirected to /dashboard |
| 3 | 🔴 | api | /api/properties | got 500, expected 200 |
...

### Failures
- /api/properties: got 500, expected 200. Body snippet: "ActiveRecord::StatementInvalid..."

### Evidence
- .claude/skills/qa-agent/state/evidence/_smoke/2026...-properties-failure-body.txt

### Next Action
🔴 FAIL → env has a real problem; do not deploy / consider rollback
```

## Production safety

- Read-only — DB queries against `production` refuse writes (see `Shared: Environment Resolution`)
- The starter checklist contains only safe, idempotent reads
- The `db` query string is statically validated for write keywords before running

## Before / After

| | Run |
|---|---|
| Before | A defined smoke checklist (or accept the starter) |
| After: 🟢 PASS | Env is healthy, deploys can proceed |
| After: 🟡 PARTIAL | Main checks fine; investigate post-deploy extras |
| After: 🔴 FAIL | Investigate before deploying / consider rollback |
