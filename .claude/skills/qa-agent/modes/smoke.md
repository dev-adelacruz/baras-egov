# Mode: smoke

## Usage

```
/qa-agent smoke                                  ← runs against local
/qa-agent smoke --env staging
/qa-agent smoke --env production
/qa-agent smoke --since-deploy                   ← include extra "did the deploy survive" checks
```

Curated smoke checks against an environment. Confirms the basics: login flow works, key pages render, key API endpoints return 2xx, sentinel DB queries return data. Posts pass/fail to Slack. Used pre-deploy as a gate and post-deploy as a verification.

**Smoke checks are defined in a YAML file** at `smoke_checklist_path` from config (default: `.claude/skills/qa-agent/smoke-checklist.yml`). On first run with no checklist file, smoke creates a starter file from common defaults and asks the user to review.

**Examples:**
```
/qa-agent smoke
→ Runs against local (default), prints results in chat

/qa-agent smoke --env staging --since-deploy
→ Runs the full checklist + post-deploy extras against staging, posts to Slack

/qa-agent smoke --env production
→ Read-only checks against production. Never runs writes.
```

---

## Phase 0 — Setup

Read config. Resolve `TRACKER` per **Shared: Tracker Detection** Steps 1–2 (skip Step 3 — smoke does not require a tracker MCP). Parse args:
- `--env <name>` → store as `ENV` (default `local`)
- `--since-deploy` → store as `POST_DEPLOY=true|false` (default `false`)

Resolve env per **Shared: Environment Resolution** — store `ENV_BASE_URL`, `DB_QUERY_CMD`.

Run **Shared: Browser Driver** pre-flight. Store `BROWSER_AVAILABLE`.

Locate the smoke checklist:
```bash
CHECKLIST_PATH=$(jq -r .smoke_checklist_path .claude/skills/qa-agent/config.json 2>/dev/null || echo ".claude/skills/qa-agent/smoke-checklist.yml")
```

If the checklist file does not exist:
1. Create the parent directory if needed
2. Write a starter checklist (see **Starter Checklist Template** below)
3. Ask: "📋 No smoke checklist found. Wrote a starter to {path}. Edit it to match this app's surface, then re-run /qa-agent smoke. Reply 'continue' to run with the starter as-is, or 'stop' to edit first."
4. On `continue` → proceed
5. On `stop` → exit cleanly

Parse the checklist. Each check has:
- `name` — display name
- `kind` — `page` / `api` / `db`
- For `page`: `path`, optional `expect_text`, optional `expect_no_text`, optional `settle_ms`, optional `steps` (driver step array — see **Shared: Browser Driver**), optional `auth: true|false`
- For `api`: `path`, `method` (default GET), optional `expect_status` (default 200), optional `expect_body_contains`, optional `auth`
- For `db`: `query` (string), optional `expect_count_min`, optional `expect_returns_rows: true|false`

`auth: true` on a `page` check requires `browser_login` in config; on an `api` check it requires an auth header source. Checks whose auth requirement can't be met are ⏸ BLOCKED, never run unauthenticated.

**Print Session State**:
```
## Session State
ENV={value} | ENV_BASE_URL={value} | BROWSER_AVAILABLE={true|false} | POST_DEPLOY={true|false}
CHECKLIST_PATH={path} | CHECKS={N} (page: P, api: A, db: D)
```

## Phase 1 — Run Checks

Group the checks by `kind`, then run each group.

### `kind: page` — all in one driver run

Do **not** drive these one at a time. Collect every `page` check into a single driver config per **Shared: Browser Driver** and run it once — one browser session, one login, one pass. Write to `/tmp/qa-agent-smoke-{env}.json`:

```json
{
  "baseUrl": "{ENV_BASE_URL}",
  "ticket": "smoke-{env}",
  "evidenceDir": ".claude/skills/qa-agent/state/evidence/smoke-{env}",
  "skipWarmup": true,
  "login": { "...from config.browser_login, only if any check has auth: true..." },
  "urls": [
    { "name": "homepage",  "path": "/",         "expectText": "Welcome" },
    { "name": "login-page","path": "/sign_in",  "expectText": "Sign in" },
    { "name": "dashboard", "path": "/dashboard","expectText": "Dashboard" }
  ]
}
```

Mapping checklist fields to driver fields:
- `path` → `path`
- `expect_text` → `expectText`
- `expect_no_text` → `expectNoText`
- `settle_ms` → `settleMs`
- `steps` → `steps` (the checklist may define interactive smoke checks — e.g. "login form actually submits"; pass them straight through)
- `auth: true` → requires `login` at the top level, from `config.browser_login`

**If any check has `auth: true` and `browser_login` is not configured:** mark those checks ⏸ BLOCKED with reason `browser_login not configured`, drop them from the driver config, and run the rest. Do not silently run them unauthenticated — an auth-gated path that 302s to the sign-in page returns 200 with no console errors and would score as a clean PASS.

```bash
node .claude/skills/qa-agent/scripts/playwright-driver.cjs \
  --config /tmp/qa-agent-smoke-{env}.json \
  > /tmp/qa-agent-smoke-{env}-result.json
```

Map results back to per-check verdicts by `name`:
- driver `PASS` → 🟢
- driver `FAIL` → 🔴, with `failures[]` copied into the check's Detail column
- exit 2 (setup / login failure) → ⏸ BLOCKED for every `page` check, with the driver's error message as the reason
- `BROWSER_AVAILABLE=false` → ⏸ BLOCKED for every `page` check

### `kind: api`
- `curl -s -o /tmp/qa-agent-smoke-body -w "%{http_code}" -X {method} {ENV_BASE_URL}{path}` (with auth header if `auth: true` — read from config or env var)
- Compare status to `expect_status`
- If `expect_body_contains` set: grep the body file
- Result:
  - 🟢 PASS if status matches and body contains substring (if specified)
  - 🔴 FAIL otherwise

### `kind: db`
- Pre-validate the query against the **Read-Only Guard** in **Shared: Environment Resolution** — refuse to run if it contains write keywords
- Execute via `DB_QUERY_CMD`
- For `expect_returns_rows: true`: PASS if at least one row
- For `expect_count_min: N`: PASS if count >= N
- Result:
  - 🟢 PASS / 🔴 FAIL / ⏸ BLOCKED (DB unreachable)

After each check: print a one-line status to chat (so long-running smokes are observable):
```
[1/12] 🟢 Homepage loads
[2/12] 🟢 Login flow
[3/12] 🔴 /api/properties — got 500, expected 200
...
```

## Phase 2 — Run Post-Deploy Extras (if `POST_DEPLOY=true`)

Additional checks that only matter post-deploy:
- **Asset bundle hash check** — `curl ENV_BASE_URL/` and grep for the JS bundle filename. Compare to current `manifest.json` (if available) — flag if stale (browser is being served the previous deploy's assets).
- **Health endpoint** — hit `/up` (Rails) / `/health` / `/api/health` if the project has one. Expect 200.
- **Job queue depth** — if Sidekiq / similar is exposed via DB or admin endpoint, run a read-only query for queue depth. Flag if depth > 10x normal.
- **Recent error rate** — if Rollbar / Sentry MCP is available, query for errors in the last 5 minutes against this env. Flag if > baseline.

These run after the main checklist. Failures in post-deploy extras downgrade the overall verdict but never escalate above 🟡 PARTIAL on their own — the main checklist drives the primary verdict.

## Phase 3 — Aggregate Verdict

| Outcome | Verdict |
|---|---|
| All main checks 🟢 (post-deploy extras 🟢 or absent) | 🟢 PASS |
| All main checks 🟢 but a post-deploy extra failed | 🟡 PARTIAL |
| Any main check 🔴 | 🔴 FAIL |
| Any ⏸ BLOCKED with no FAIL | ⏸ BLOCKED |

## Phase 4 — Render the Report

```
## Smoke Report — {env}

### Verdict
{🟢 PASS | 🟡 PARTIAL | 🔴 FAIL | ⏸ BLOCKED} — {N}/{M} checks passed

### Checks
| # | Result | Kind | Name | Detail |
|---|---|---|---|---|
| 1 | 🟢 | page | Homepage loads | 200, 1.2s |
| 2 | 🟢 | page | Login flow | redirected to /dashboard |
| 3 | 🔴 | api | /api/properties | got 500, expected 200 |
...

### Post-Deploy Extras (if POST_DEPLOY=true)
| Check | Result | Detail |
|---|---|---|
| Asset bundle | 🟢 | hash matches manifest |
| /up health | 🟢 | 200 |
...

### Failures
- {check name}: {detail}
- ...

### Evidence
- Screenshots: {path list}
- Failure response bodies: {path list, truncated}

### Next Action
- 🟢 PASS → env is healthy
- 🟡 PARTIAL → main checks passed but extras failed; investigate before / after deploy continues
- 🔴 FAIL → env has a real problem; do not deploy / consider rollback
- ⏸ BLOCKED → re-run after fixing the blocker
```

## Phase 5 — Post to Slack

Post per **Shared: Slack Thread** to `slack_channel`:
```
{verdict-symbol} Smoke {env} — {N}/{M} checks passed
```
Thread reply with the failures (if any) and a link to evidence paths.

## Phase 6 — Write to Smoke History

Append to `.claude/skills/qa-agent/state/smoke-history.json`:
```json
[
  {
    "env": "staging",
    "verdict": "PASS",
    "ran_at": "<ISO8601>",
    "checks_total": 12,
    "checks_passed": 12,
    "post_deploy": false
  }
]
```

This lives under `state/`, which the skill's `.gitignore` excludes — so it is a **local** trend record, not a shared one. It's useful for spotting "smoke has been failing for 3 days" patterns on your own machine. If the team wants a shared history, post the verdict to Slack (Phase 5 already does) rather than trying to commit this file. Cap to last 100 entries.

---

## Starter Checklist Template

When no checklist exists, write this skeleton (and adapt to detected stack — this is a Rails+SPA flavor):

```yaml
# Smoke checks for qa-agent. Edit to match this app's real surface.
#
# kind: page  → runs through scripts/playwright-driver.cjs (real browser)
# kind: api   → curl
# kind: db    → read-only query via the env's DB_QUERY_CMD
#
# Checks with `auth: true` need `browser_login` set in config.json.
# Without it they report ⏸ BLOCKED rather than running signed-out.

checks:
  - name: Homepage loads
    kind: page
    path: /
    expect_text: "Welcome"

  - name: Login page renders
    kind: page
    path: /sign_in
    expect_text: "Sign in"

  # Requires config.browser_login. Delete this check if you do not want to
  # store QA credentials — do not leave it in expecting it to pass.
  - name: Authenticated dashboard
    kind: page
    path: /dashboard
    auth: true
    expect_text: "Dashboard"

  # Interactive check: proves the login form actually submits, not just renders.
  # This is the class of failure a navigation-only check cannot see.
  - name: Login form submits
    kind: page
    path: /sign_in
    settle_ms: 300
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

  - name: Properties index
    kind: api
    path: /api/properties.json
    expect_status: 200

  - name: Users table has rows
    kind: db
    query: "User.count"
    expect_count_min: 1
```

The user is expected to edit this to match the actual app surface before re-running. Point out explicitly that `REPLACE_ME` and any `auth: true` check will fail or block until they are filled in — a starter file that silently reports failures on first run trains people to ignore smoke output.
