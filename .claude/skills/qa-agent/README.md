# qa-agent

A six-mode QA assistant that owns the loop from **test planning** through **Ready-for-QA verification** — with live browser evidence, structured bug filing, environment smoke checks, and end-of-sprint batching. Companion to [`dev-agent`](../dev-agent/), built on the same patterns (per-project config, tracker auto-detect, shared MCPs) but from a QA perspective.

This skill lives in-tree under `.claude/skills/qa-agent/`. It's auto-discovered by Claude Code on session start.

---

## Quick start

```
1. /qa-agent config             ← interactive setup, ~5 min, run once per repo
2. /qa-agent config validate    ← confirm Jira / GitHub / Playwright reachable
3. /qa-agent plan BRGY-1        ← try a read-only mode on a real ticket
```

That's it. Everything else is variations.

---

## How to invoke it

You "use" the skill by **invoking `/qa-agent <mode>` in Claude Code**. There's no CLI binary or hotkey.

| Form | Example |
|---|---|
| Slash form | `/qa-agent verify BRGY-41` |
| Natural language | `run qa-agent verify on BRGY-41` |
| With flags | `/qa-agent smoke --env staging --since-deploy` |

The agent reads `SKILL.md`, routes to the right `modes/<mode>.md`, and executes. Verdicts and reports are returned in chat; side effects (ticket transitions, Slack posts, bug tickets) are noted in the report.

---

## The six modes

Pick the mode that matches **what just happened**, not what role you're playing. Each mode owns one situation.

### `/qa-agent plan <ticket>`

**When:** new ticket assigned, AC is messy or sparse.
**Does:** reads the ticket → produces an AC checklist + positive/negative/edge cases + regression risks. Posts the full plan as a Jira comment, then appends a one-line "QA Plan: see comment" footer to the ticket description so anyone scanning the ticket can find it without scrolling. Re-running `plan` replaces the footer in place rather than stacking up duplicates.
**Side effects:** comment on the ticket (you're prompted before posting).
**Risk:** none — read-only by default.

### `/qa-agent review [PR] [--comment]`

**When:** dev opens a PR, optional pre-Ready-for-QA gate.
**Does:** PR-time QA-lens review — looks for untested code paths, missing AC coverage, regression risk, observability gaps.
**Side effects:** with `--comment`, posts inline GitHub review comments via `gh`.
**Risk:** comments are visible to the team — review the proposed comments first.

### `/qa-agent verify <ticket> [PR] [--env]`

**The core mode.** When dev marks a ticket Ready for QA (feature OR bug-fix).
**Does:**
- Auto-detects feature vs. bug-fix from the ticket
- For features: sorts ACs into four buckets — test-runner, DB-query, browser-navigation, and **browser-interaction** — then runs each. Interaction ACs drive real clicks and form fills, so mutation paths actually fire.
- For bug-fixes: replays the original repro steps and asserts the bug is gone
- Logs in first when an AC needs a signed-in user (`browser_login`)
- Returns a single verdict: 🟢 PASS / 🟡 PARTIAL / 🔴 FAIL / ⏸ BLOCKED, plus a **Coverage** table naming any surface it could not exercise
- **Moves the ticket to `In Progress` on FAIL** — PASS/PARTIAL are comment-only; you move it to `Passed QA` yourself after reviewing the verdict
- **On FAIL: offers to file a linked regression ticket** (shows it first; auto-files only inside `sweep`)

**Side effects:** ticket comment (Jira transition only on FAIL), Slack post on FAIL, evidence files written, possibly a new bug ticket filed (with confirmation).
**Risk:** on FAIL it moves the ticket state. To dry-run the first time say `verify DEV-XXXX but don't transition the ticket and don't post to Slack`.

> **Mutation guardrail.** If the PR touches create/update/delete code and no interactive step was run, the verdict is capped at 🟡 PARTIAL with "mutation path not exercised" in the findings. A green gate that never fired the request is how the lowercase-`patch` bug reached production.

### `/qa-agent bug <description | --from-slack | --from-screenshot | --from-log>`

**When:** user/Slack reports a bug.
**Does:** triage + file in one mode. Tries to reproduce → classifies (`real_bug` / `user_error` / `env_issue` / `flake` / `cannot_reproduce`) → on confirmed bug, files a structured Jira ticket with severity (Sev1–Sev4), evidence, and a duplicate search.
**Side effects:** new Jira ticket (shown for confirmation first), Slack thread reply if configured.
**Risk:** can create real Jira tickets. `bug` asks before filing, and `verify` shows the proposed regression ticket on FAIL before creating it.

### `/qa-agent smoke [--env <env>] [--since-deploy]`

**When:** pre-/post-deploy or scheduled health check.
**Does:** runs a YAML-defined checklist of `page` / `api` / `db` checks against the target env. With `--since-deploy`, also checks asset bundle freshness, health endpoints, and queue depth.
**Side effects:** Slack post with verdict, appends to `.claude/skills/qa-agent/state/smoke-history.json`.
**Risk:** **production is hard-guarded as read-only** — any DB query containing write keywords aborts.

The checklist lives at `.claude/skills/qa-agent/smoke-checklist.yml` (path configurable). On first run, smoke writes a starter file and asks you to review it.

### `/qa-agent sweep [--resume] [--dry-run]`

**When:** end-of-sprint, batch the entire Ready-for-QA queue.
**Does:** lists every Jira ticket in your Ready-for-QA status for the configured team → calls `verify` per ticket → posts a single summary to Slack at the end. Checkpoints in `.claude/skills/qa-agent/state/sweep-checkpoint.json` so you can resume after a crash.
**Side effects:** N ticket comments (state moved to `In Progress` only on FAIL — never auto-moved to `Passed QA`), N Slack posts (varied framing), possibly N new bug tickets.
**Risk:** burns tokens fast on big queues. `--dry-run` first if the queue is large.

### `/qa-agent config [edit | reset | validate | show-context]`

Utility commands for the per-project config file:

| Subcommand | Purpose |
|---|---|
| `/qa-agent config` | Show current config |
| `/qa-agent config edit` | Update specific keys interactively |
| `/qa-agent config validate` | Test connectivity for GitHub, Jira, Slack, env URLs, Playwright, browser login |
| `/qa-agent config reset` | Wipe and redo setup |
| `/qa-agent config show-context [ticket]` | Inspect stored per-ticket QA history |

---

## Mode chains (common workflows)

| Situation | Run |
|---|---|
| New ticket assigned, AC is sparse | `plan` |
| Dev opens a PR (optional pre-QA gate) | `review` |
| Dev marks ticket Ready for QA (feature or bug-fix) | `verify` (auto-chains to `bug` on FAIL) |
| User/Slack reports a bug | `bug` |
| About to deploy or just deployed | `smoke --env staging` then `smoke --env production --since-deploy` |
| End of sprint | `sweep` |

The `verify` → `bug` handoff is automatic. No manual chain needed.

---

## First-time setup

Running any mode for the first time triggers **Config Setup**. You'll be prompted, one key at a time, for:

`config.json` ships pre-seeded with what could be derived from this repo, so setup only
prompts for the keys it cannot know:

| Key | Value | Status |
|---|---|---|
| `repo` | `dev-adelacruz/baras-egov` | ✅ seeded |
| `jira_domain` | `adelacruz.atlassian.net` | ✅ seeded |
| `jira_project` | `BRGY` | ✅ seeded |
| `base_branch` | `main` | ✅ seeded |
| `local_url` | `http://localhost:3000` | ✅ seeded |
| `qa_ready_state` | your Jira status meaning "dev done, QA take it" | ⚠️ **prompts on first run** |
| `qa_passed_state` | status to move to on QA pass | ⚠️ **prompts on first run** |
| `qa_failed_state` | status to move to on QA fail | ⚠️ **prompts on first run** |

These three must match your BRGY workflow **exactly, case-sensitive**. Check them in Jira
first — a near-miss like `Ready For QA` vs `Ready for QA` fails at transition time, not at
setup time.

Optional (skip with blank input):
- `slack_thread_ts` — Slack message timestamp (e.g. `1777817464.885489`). When set, **all qa-agent output threads under this single Slack message** instead of creating a new parent per verdict. Useful when QA output is a low-volume side stream that shouldn't fragment a busy channel. Get the ts from a Slack permalink: `.../archives/{channel}/p1777817464885489` → `1777817464.885489` (insert `.` before the last 6 digits).
- `slack_group` — Slack subteam handle to ping on FAIL
- `bug_assignee` — `auto` (= last committer on the relevant file), `@username`, or a GitHub team slug
- `bug_priority_default` — 1–4 (Sev1–Sev4) for inconclusive triage
- `smoke_checklist_path` — defaults to `.claude/skills/qa-agent/smoke-checklist.yml`

> **Slack output: channel mode vs pinned-thread mode.** By default (no `slack_thread_ts`), qa-agent posts a new parent message to `slack_channel` for each verdict and threads evidence under it. With `slack_thread_ts` set, every verdict (and its evidence replies) lands as new replies under the one pinned thread — keeping all QA chatter consolidated. Pick channel mode if multiple QA folks need to scan verdicts independently; pick pinned-thread mode if QA is solo or low-volume.

Output is written to `.claude/skills/qa-agent/config.json`. Commit it so teammates share the setup.

---

## Where state lives

| Path | Gitignored? | Purpose |
|---|---|---|
| `.claude/skills/qa-agent/config.json` | tracked | Project config (one per repo) |
| `.claude/skills/qa-agent/state/context/{TICKET}.json` | gitignored | Per-ticket QA history (qa_plan, verify verdict, bug filed, review verdict) |
| `.claude/skills/qa-agent/state/evidence/{TICKET}/` | gitignored | Playwright screenshots, console / network dumps, trace files |
| `.claude/skills/qa-agent/state/sweep-checkpoint.json` | gitignored | In-flight sweep state |
| `.claude/skills/qa-agent/state/sweep-history-{date}.json` | gitignored | Archived sweep runs |
| `.claude/skills/qa-agent/state/smoke-history.json` | gitignored (local only) | Last 100 smoke runs |
| `.claude/skills/qa-agent/smoke-checklist.yml` | tracked (recommended) | Your team's smoke checks |

Everything under `state/` is excluded by the skill's own `.claude/skills/qa-agent/.gitignore`. Nothing is written to the project's root `.gitignore` — the skill is self-contained.

> **"Tracked" is a claim you should verify, not assume.** `config.json` is only shared with teammates if the skill directory is actually committed. Check:
> ```bash
> git ls-files .claude/skills/qa-agent | head
> ```
> Empty output means the skill is untracked and nothing here is shared. Fix with `git add .claude/skills/qa-agent`, and confirm `state/` is absent from the staged list before committing.

> **Why everything inside `.claude/skills/qa-agent/`?** Same pattern as the companion `dev-agent` skill — config and runtime state live alongside the skill files, with `state/` gitignored and `config.json` / `smoke-checklist.yml` committed. Keeps the skill self-contained, easy to vendor, and avoids polluting the project root.

---

## This-repo specifics

- **Tracker:** Jira (`BRGY` project on `adelacruz.atlassian.net`).
- **Base branch:** `main`.
- **Backend tests:** `bundle exec rspec` (auto-detected from `Gemfile`).
- **Frontend tests:** `yarn test` → Vitest (auto-detected from `package.json`).
- **DB queries:** local only — `bin/rails runner "..."`. No staging or production URL is
  configured, so `--env staging` / `--env production` will stop at env resolution until you
  add `staging_url` / `production_url`. That is the intended behaviour: qa-agent will not
  guess at an environment it has not been told about.
- **Slack:** not configured. Every mode skips Slack posting and notes `⊝ Slack not configured`
  once per report. Set `slack_channel` if you want verdicts posted.
- **Playwright:** not a repo dependency, but the driver resolves it from the npx cache, so
  browser verification works. Confirm with `npx playwright --version`; if that fails:

  ```bash
  npx playwright --version          # warms ~/.npm/_npx cache
  npx playwright install chromium   # ~150 MB, one time
  ```
- **Auth-gated verification:** set `browser_login` in config to unblock signed-in surfaces.
  Without it every authenticated AC returns ⏸ BLOCKED — honest, but it leaves most of an
  eGov app unverified. Use a dedicated QA account, never a real citizen or admin login.
- **`e2e_framework`** is seeded as `none`: this repo has no committed e2e suite. That does
  **not** disable browser verification — the driver is independent of it.

---

## When it degrades gracefully

| Missing thing | What happens |
|---|---|
| Playwright not installed | Browser ACs marked ⏸ BLOCKED with a warning. Verdict still produced from test output + DB. |
| `browser_login` not configured | Auth-gated ACs marked ⏸ BLOCKED. Public surfaces still verified. |
| QA account password stale | Driver exits 2 → all browser ACs ⏸ BLOCKED, reported as a **config** problem, not a product failure. |
| Slack MCP unreachable / `slack_channel` blank | Note in report and continue — never aborts. |
| Atlassian MCP unreachable | Hard stop at Phase 0 pre-flight (every mode needs the tracker). |
| `.claude/skills/qa-agent/config.json` missing | Auto-runs Config Setup before proceeding. |
| `.claude/skills/qa-agent/smoke-checklist.yml` missing | Smoke writes a starter file and asks you to review. |


The rule underneath all of these: **a surface that could not be exercised is reported as ⏸ BLOCKED with the reason named — never as a silent pass.**

---

## Production safety

When `--env production` is the target, every DB query is checked against the **Read-Only Guard** in `references/environments.md`. It is deny-first: a query runs only if it starts with a read pattern *and* contains no write token. Denied tokens cover persistence (`.save`, `.create`, `.update*`, `.upsert`, `.insert_all`), destruction (`.destroy*`, `.delete*`), in-place mutation (`.touch`, `.increment!`, `.toggle!`), find-or-write, side effects (`.deliver_now`, `.perform_later`), raw SQL DDL/DML, and escape hatches (`send(`, `eval(`, backticks).

Applies to both raw SQL and ORM-style invocations. There is no override flag.

**Stated limits** — the guard is substring matching, not a parser. Runtime string interpolation, callbacks that write during a read, and metaprogramming can all reach a write without naming it (the obvious metaprogramming tokens are denied outright). For anything non-obvious on production, prefer a plain `SELECT` through `psql` over a `rails runner` that instantiates models.

---

## Verdict format (what every report produces)

| Symbol | Verdict | Meaning |
|---|---|---|
| 🟢 | PASS | All checks green — feature meets ACs / bug is gone / env is healthy |
| 🟡 | PARTIAL | Passes the spec but with caveats — UX nit, perf concern, minor polish |
| 🔴 | FAIL | Clear regression / AC miss / bug reproduced / critical smoke check down |
| ⏸ | BLOCKED | Couldn't run the verdict — env down, missing data, MCP unreachable, prerequisite skipped |

Every verdict carries an **Evidence** section (screenshots, test output, DB results, console/network failures), an **AC checklist** (`verify` feature mode) or **Repro steps** (`verify` bug mode and `bug` mode), and a **Next action** line.

---

## Severity triage (when `bug` files a ticket)

| Severity | Signals | Jira priority |
|---|---|---|
| **Sev 1** | Production outage, data loss, security breach, payments broken, login broken for all users | Highest |
| **Sev 2** | Broken core feature with no workaround; many users affected | High |
| **Sev 3** | Degraded UX with workaround; subset of users; non-critical feature broken | Medium |
| **Sev 4** | Cosmetic, copy, alignment, accessibility nits, edge-case-only | Low |

Decision rules: production env + DB write side-effect → Sev 1 automatically. Affects auth/payments → escalate one level. Single-record/single-user → demote one level.

---

## Troubleshooting

**"⛔ No tracker configured."**
Run `/qa-agent config` to set up Jira keys.

**"⛔ Ticket BRGY-N not found in jira."**
Check the key exists and that the Atlassian MCP is authenticated (`/qa-agent config validate`).

**A transition fails but setup succeeded.**
Your `qa_ready_state` / `qa_passed_state` / `qa_failed_state` doesn't match a real BRGY workflow status. Run `/qa-agent config edit` and use the exact case-sensitive name from Jira.

**Every browser AC comes back ⏸ BLOCKED.**
Either Playwright can't be resolved (`npx playwright --version`) or the ACs are auth-gated and `browser_login` isn't set. The report names which one — it will not quietly pass them.

**"⚠️ Playwright not installed locally."**
See [This-repo specifics](#this-repo-specifics) above.

**"⛔ Production is read-only. Refusing to run a write query."**
Working as intended. Rewrite the query to read-only or run it against staging.

**The skill doesn't appear in the skills list.**
Claude Code scans `.claude/skills/` on session start. Restart the session, or check that `SKILL.md` has valid frontmatter (`name:` and `description:` between `---` markers).

**Tickets aren't transitioning.**
Check `/qa-agent config validate` — the Atlassian MCP probably isn't authenticated.

---

## Deep dives

Per-mode docs (more detail than the summaries above):

- [`docs/plan.md`](docs/plan.md)
- [`docs/verify.md`](docs/verify.md)
- [`docs/bug.md`](docs/bug.md)
- [`docs/review.md`](docs/review.md)
- [`docs/smoke.md`](docs/smoke.md)
- [`docs/sweep.md`](docs/sweep.md)
- [`docs/config.md`](docs/config.md)

Skill internals (shared subsystems — config schema, tracker detection, browser driver, environment resolution, severity triage, session context): [`SKILL.md`](SKILL.md).

---

## Why six modes (not twelve)

QA's surface is narrower than dev's. Several "obvious" modes collapse into one:

- **`acceptance` + `verify-fix` → merged into `verify`.** Same input (ticket + PR), same output (verdict + evidence). One mode that branches on ticket type beats two near-duplicates.
- **`triage` + `bug` → merged into `bug`.** Sequential steps in one workflow, never invoked separately.
- **Dropped:** `write` (test code generation is dev work), `coverage` (low frequency, defer), `regress` (mostly CI's job — `verify` already runs targeted tests), `flaky` (subset of regression triage).
