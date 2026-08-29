---
name: qa-agent
description: Six-mode QA agent + config utility. Supports Jira and Linear (auto-detected from config). Modes: plan (ticket → test plan), verify (Ready-for-QA gate), bug (triage + file), review (PR-time QA review), smoke (env health checks), sweep (batch verify). Use "qa-agent config" to view, edit, validate, or reset project config.
---

# QA-Agent

## Mode Routing

On invocation, read the corresponding file from this skill's `modes/` directory then execute it.

| Invocation | File |
|---|---|
| `/qa-agent plan` | `modes/plan.md` |
| `/qa-agent verify` | `modes/verify.md` |
| `/qa-agent bug` | `modes/bug.md` |
| `/qa-agent review` | `modes/review.md` |
| `/qa-agent smoke` | `modes/smoke.md` |
| `/qa-agent sweep` | `modes/sweep.md` |
| `/qa-agent config` | `modes/config.md` |

---

## Shared Systems

Mode files reference shared systems by name, as **Shared: X**. Each maps to a file in `references/`. **Read the reference file the first time a mode invokes it — do not work from memory of the name.** Load only what the current mode actually needs.

| Referenced as | File | Load when |
|---|---|---|
| **Shared: Config System** | `references/config.md` | Phase 0 of every mode; all `config` subcommands |
| **Shared: Tracker Detection** | `references/tracker.md` | Phase 0 of every mode (resolving tracker, tickets, transitions, comments) |
| **Shared: Browser Driver** | `references/browser-driver.md` | Any mode that drives a browser — verify, bug, smoke, sweep |
| **Shared: Environment Resolution** | `references/environments.md` | Any mode taking `--env`, or running a DB query |
| **Shared: Session Context** | `references/session-context.md` | Phase 0 read + end-of-mode write |
| **Shared: Verdict Format** | `references/reporting.md` | Any mode producing a verdict |
| **Shared: Severity Triage** | `references/reporting.md` | `bug`, and `verify` on FAIL |
| **Shared: Slack Thread** | `references/reporting.md` | Any mode posting to Slack |
| **Shared: Session State Block** | `references/reporting.md` | End of Phase 0 in every mode |
| **Shared: Analysis Frame** | `references/reporting.md` | Any mode with an `<analysis>` block |
| **Shared: Test Stack Detection** | below | Any mode that runs tests |

---

## Shared: Test Stack Detection

Run once at Phase 0 of any mode that runs tests or detects e2e capabilities: **plan, verify, bug, review, smoke, sweep**.

### Step 1 — Detect Backend Test Runner (`BE_TEST_CMD`, `BE_TEST_DIR`)
Check in order:
- `Gemfile` contains `rspec` → `BE_TEST_CMD=bundle exec rspec`, `BE_TEST_DIR=spec/`
- `Gemfile` contains `minitest` → `BE_TEST_CMD=bundle exec rails test`, `BE_TEST_DIR=test/`
- `requirements.txt` or `pyproject.toml` contains `pytest` → `BE_TEST_CMD=pytest`, `BE_TEST_DIR=tests/`
- `go.mod` exists → `BE_TEST_CMD=go test ./...`, `BE_TEST_DIR=.`
- `package.json` (BE) `scripts.test` exists → `BE_TEST_CMD=npm test` (or `yarn test`), `BE_TEST_DIR=` (best-effort)
- None → `BE_TEST_CMD=none`

### Step 2 — Detect Frontend Test Runner (`FE_TEST_CMD`, `FE_TEST_DIR`)
Locate `FRONTEND_ROOT` (check in order: `front/`, `frontend/`, `app/frontend/`, `client/`, `src/` — first one with a `package.json`). Then:
- `vitest` in deps → `FE_TEST_CMD=yarn test`, `FE_TEST_DIR={FRONTEND_ROOT}/src` (best-effort)
- `jest` in deps → `FE_TEST_CMD=yarn test`, `FE_TEST_DIR={FRONTEND_ROOT}/__tests__`
- None → `FE_TEST_CMD=none`

### Step 3 — Detect E2E Framework (`E2E_FRAMEWORK`, `E2E_RUN_CMD`, `E2E_DIR`)
Override: if config has `e2e_framework` set to `playwright` / `cypress` / `none`, use that. Otherwise:
- `@playwright/test` in any `package.json` deps → `E2E_FRAMEWORK=playwright`, `E2E_RUN_CMD=npx playwright test`, `E2E_DIR=tests/e2e` (or `e2e/`, whichever exists)
- `cypress` in any `package.json` deps → `E2E_FRAMEWORK=cypress`, `E2E_RUN_CMD=npx cypress run`, `E2E_DIR=cypress/e2e`
- None → `E2E_FRAMEWORK=none`

`E2E_FRAMEWORK=none` does **not** mean browser verification is unavailable — the canonical driver at `scripts/playwright-driver.cjs` resolves Playwright from the npx cache and works without a repo-level install. It only means the project has no committed e2e suite to run.

### Step 4 — Cache
Cache `BE_TEST_CMD`, `FE_TEST_CMD`, `E2E_FRAMEWORK` in **Shared: Session Context** under `stack`, together with `lockfile_path` and a **real** `lockfile_mtime`:
```bash
LOCKFILE_MTIME=$(stat -f %m "$LOCKFILE" 2>/dev/null || stat -c %Y "$LOCKFILE" 2>/dev/null || echo 0)
```
Re-detect on mtime change, on a recorded mtime of `0`, or if `detected_at` is older than 7 days. See `references/session-context.md` → **Stack detection cache**.

---

## Mode Chains

Natural workflows across modes — use these as a guide for what to run next:

| Situation | Mode sequence |
|---|---|
| New ticket assigned with messy AC | `plan` |
| Dev opens a PR (optional pre-Ready-for-QA gate) | `review` |
| Dev marks ticket Ready for QA (feature OR bug-fix) | `verify` |
| User/Slack reports a bug | `bug` |
| Pre-deploy / post-deploy / scheduled health check | `smoke` |
| End of sprint / batch the Ready-for-QA queue | `sweep` |

When `verify` returns FAIL, it hands off to `bug` to file a regression ticket (with confirmation — see `modes/verify.md` Phase 5).

---

## Non-negotiables

These override anything a mode file appears to say otherwise:

1. **Never invent a browser API.** All browser work goes through `scripts/playwright-driver.cjs`. There is no `goto()`, `login_as()`, `assert_text()`, `console_logs()` or `screenshot()` helper available to this skill.
2. **Never report an unverified surface as verified.** A skipped browser bucket is ⏸ BLOCKED with the reason named, never a silent 🟢. Driver exit 2 is BLOCKED, not PASS.
3. **Never auto-transition a ticket to the passed state.** A human moves it after reading the verdict. On FAIL the ticket moves to the failed state so the dev picks it back up.
4. **Production is read-only.** No override flag. See `references/environments.md` → Step 3.
5. **Exercise mutation paths.** If a PR changes create/update/delete behaviour, the driver config needs a `steps` block. A verify run touching mutation code with no interactive step is capped at 🟡 PARTIAL.
6. **Stick to the enums.** `verify.result` is one of PASS / PARTIAL / FAIL / BLOCKED. Detail that doesn't fit goes in `notes`.
