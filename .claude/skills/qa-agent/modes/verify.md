# Mode: verify

## Usage

```
/qa-agent verify [ticket key or URL] [PR link or number] [--env local|staging|production]
/qa-agent verify [ticket key or URL]                       ← PR inferred from PR list if exactly one open PR mentions the ticket
```

The core QA gate. Validates that a Ready-for-QA ticket actually meets its acceptance criteria (for features) or that the original failure is gone (for bug-fixes). Captures live evidence via Playwright + DB queries + targeted test runs, returns a single verdict, comments on the ticket (and on FAIL moves it back to the failed state), and on FAIL hands off to `bug` to file a regression ticket. It never auto-transitions a ticket to the passed state — a human moves it after reviewing the verdict.

**Auto-detects feature vs. bug-fix mode:**
- Ticket type = `Bug` OR ticket description contains a Steps-to-Reproduce / Repro / Reproduction section → **bug-fix mode** (replay the original failure)
- Otherwise → **feature mode** (walk the AC checklist)

`--env` defaults to `local` if omitted. Use `staging` to verify against an already-deployed staging copy of the PR.

**Examples:**
```
/qa-agent verify BRGY-46 519
→ Feature mode (AC walkthrough) against PR #519, tested locally

/qa-agent verify BRGY-01 524 --env staging
→ Bug-fix mode (replay repro) against PR #524 deployed to staging

/qa-agent verify BRGY-71
→ PR auto-inferred (must be exactly one open PR mentioning BRGY-71 in title or body)
```

---

## Phase 0 — Setup

Read config. Resolve `TRACKER` per **Shared: Tracker Detection** (Steps 1–3 — including pre-flight). Parse args:
- First positional arg = ticket → derive `TICKET_KEY` per Step 4
- Second positional arg = PR link or number → store as `PR_NUMBER`
- `--env <name>` → store as `ENV`, default `local`

If `PR_NUMBER` was not provided:
```bash
PR_LIST=$(gh pr list --search "in:title in:body {TICKET_KEY}" --state open --repo {REPO} --json number,title,headRefName --jq '.')
```
- Exactly one match → use it; log `[pr] PR #N inferred from search ({title})` in Session State
- Zero or multiple matches → stop with:
  ```
  ⛔ Could not auto-infer PR for {TICKET_KEY} (found {N} matches).
  Usage: /qa-agent verify {TICKET_KEY} <PR>
  ```

Fetch the ticket per **Shared: Tracker Detection** Step 5. Stop if not found.

Detect mode:
- Ticket type field is `Bug` (Linear) / issuetype = `Bug` (Jira) → `MODE=bug-fix`
- Otherwise scan ticket description (case-insensitive) for any of: `## Steps to Reproduce`, `### Repro`, `**Steps:**`, `Reproduction:`, `How to reproduce`. If matched → `MODE=bug-fix`
- Else → `MODE=feature`

Resolve env per **Shared: Environment Resolution** — store `ENV_BASE_URL` and `DB_QUERY_CMD`.

Read context per **Shared: Session Context**. If `qa_plan` is present: store as `QA_PLAN_LOADED=true`. If `MODE=bug-fix` and the ticket description has Steps-to-Reproduce: extract them as `REPRO_STEPS` (array of strings).

Run **Shared: Test Stack Detection** (cached if matching).

Run **Shared: Browser Driver** pre-flight. Store `BROWSER_AVAILABLE=true|false`.

Fetch PR diff:
```bash
gh api repos/{REPO}/pulls/{PR_NUMBER} --jq '{base, head, files_url}'
gh api repos/{REPO}/pulls/{PR_NUMBER}/files --jq '.[] | {filename, additions, deletions, status}'
```
Store changed-file list as `CHANGED_FILES`.

Create the evidence directory: `mkdir -p .claude/skills/qa-agent/state/evidence/{TICKET_KEY}`.

**Print Session State**:
```
## Session State
TRACKER={value} | TICKET_KEY={value} | PR_NUMBER={value} | MODE={feature|bug-fix} | ENV={value}
ENV_BASE_URL={value} | E2E_FRAMEWORK={value} | BROWSER_AVAILABLE={true|false}
[context] loaded {TICKET_KEY} (qa_plan: {yes|no})
[pr] {N} files changed
```

## Phase 1 — Plan the Verification

```xml
<analysis>
  <context>
    Mode ({feature|bug-fix}). Ticket title + AC (or repro steps). Env target. PR scope.
    For feature mode: which ACs need browser verification vs. unit test verification vs. DB query verification?
    For bug-fix mode: what was the original failure signature and how will we know it's gone?
  </context>
  <files>
    PR's changed files. Map each AC (or repro step) to which changed file(s) implement it.
    For ACs with no apparent backing change: flag as "AC not addressed by PR diff".
  </files>
  <task>
    Build a per-AC (feature) or per-step (bug-fix) verification plan:
    - What URL(s) to visit
    - What user actions to perform
    - What to assert (text / element / URL / DB state)
    - What screenshot(s) to capture as evidence
    - Which targeted test file (if any) to run
  </task>
  <constraints>
    - Prefer the QA plan from context if present — otherwise derive ACs from the ticket description.
    - Every AC / step gets its own verdict slot. Do not collapse into a single overall pass/fail.
    - For browser steps, prefer role/text selectors over CSS to keep the verification resilient.
    - Read-only mode in production env — DB writes are forbidden by Shared: Environment Resolution.
  </constraints>
</analysis>
```

## Phase 2A — Execute (Feature Mode)

Group the ACs into four buckets:

1. **Test-runner ACs** — covered by an existing `*_spec.rb`, `*.test.ts`, etc. Run via `BE_TEST_CMD` / `FE_TEST_CMD` / `E2E_RUN_CMD`.
2. **DB-query ACs** — covered by a `bin/rails runner` (or env equivalent) read-only assertion. Run via `DB_QUERY_CMD` per **Shared: Environment Resolution**.
3. **Browser-navigation ACs** — the AC is satisfied by a page rendering correctly. Assert page-level signals (HTTP status, console errors, map polygons, JSON shape, expected text) via the canonical driver.
4. **Browser-interaction ACs** — the AC describes a user *doing* something: submitting, saving, deleting, toggling, uploading. These need a `steps` block in the driver config. **A navigation-only check cannot verify an interaction AC** — the request never fires, so the page loads clean and the AC scores 🟢 while the feature is broken.

All browser work goes through the canonical driver per **Shared: Browser Driver** — never write ad-hoc Playwright scripts.

**Bucket 4 is not optional.** Any AC containing a verb like save / create / update / delete / submit / add / remove / edit / toggle / upload / invite / archive belongs in bucket 4. If you find yourself putting such an AC in bucket 3, that is the mistake this bucket exists to prevent.

### Calling the driver (browser ACs)

Build a config JSON at `/tmp/qa-agent-driver-{TICKET_KEY}.json`. Include every browser AC URL in one config so the driver runs them in a single browser session (one login, warmup + scored pass per URL). Name each URL after the AC it verifies (`ac-N-slug`) so results map back unambiguously.

Set `expectMap: true` on every URL that should render a Google Maps polygon, `expectJson: true` (with optional `requireKeyPath`) on every JSON endpoint, `expectText` where a specific string must be visible, and a `steps` array on every interaction AC (bucket 4):

```json
{
  "baseUrl": "{ENV_BASE_URL}",
  "ticket": "{TICKET_KEY}",
  "evidenceDir": ".claude/skills/qa-agent/state/evidence/{TICKET_KEY}",
  "login": { "...copy config.browser_login verbatim if any AC needs a signed-in user..." },
  "urls": [
    { "name": "ac-1-index", "path": "/services/permits",            "expectMap": true },
    { "name": "ac-2-detail",  "path": "/services/permits/barangay-clearance",  "expectMap": true },
    { "name": "ac-3-lookup",     "path": "/regions/lookup.json?slug=barangay-1", "expectJson": true, "requireKeyPath": "region.geojson.type" },
    { "name": "ac-4-request-edit",     "path": "/requests/abc123/edit",      "expectText": "Edit your request" },
    {
      "name": "ac-5-save-draft",
      "path": "/drafts/new",
      "settleMs": 500,
      "steps": [
        { "action": "fill",        "selector": "#draft_title", "value": "QA draft" },
        { "action": "click",       "selector": "button:has-text('Save')" },
        { "action": "waitForText", "text": "Draft saved", "timeoutMs": 8000 },
        { "action": "expectNoText","text": "Something went wrong" },
        { "action": "screenshot",  "name": "ac-5-after-save" }
      ]
    }
  ]
}
```

**Auth-gated ACs.** If any AC needs a signed-in user, include the `login` block from `config.browser_login`. If it is not configured, those ACs are ⏸ BLOCKED with reason `browser_login not configured` — state that in the report and suggest `/qa-agent config edit`. Never score an auth-gated URL without login: the redirect to the sign-in page returns 200 with no console errors and reads as a clean PASS.

**When `ENV=staging` or `ENV=production`**, add two extra fields to the driver config:
- `"skipWarmup": true` — skips the discarded first run (staging has no Rails autoload warmup to absorb)
- `"cookies": [...]` — inject auth cookies if any ACs require an authenticated page (see **Staging: Auth** below)

**Staging: Auth**

If any AC requires a signed-in user in staging, look up a test user's magic-link token and inject the resulting session cookie:

```bash
# Generate a magic link for a test user and extract the token
<env shell> rails runner 'u = User.find_by(email: "qa-test@example.com"); puts u.magic_link_token' --remote staging
# Visit the magic link once manually (or via curl -L) to establish the session, then copy the _session cookie value
```

Then pass the cookie in the driver config:
```json
"cookies": [
  { "name": "_session_id", "value": "<token>", "domain": "staging.example.com", "path": "/" }
]
```

If staging ACs are entirely public (no login required), omit `cookies`.

---

### Staging: Testing time-delayed side effects

Features that queue work for the future (an email that fires 3 days after an event, a
scheduled status change) cannot be verified by waiting. Use one of these instead, in
increasing order of fidelity:

**Option A — Call the unit directly** (fastest; tests the artifact, not the pipeline):
```bash
<env shell> rails runner 'SomeMailer.send_message(<record_id>).deliver_now'
```

**Option B — Advance the scheduled time** (tests the full queue → worker → artifact path):
```bash
<env shell> rails runner '
  job = ScheduledThing.find_by(status: :pending)
  job.update!(run_after: 1.minute.from_now)
  puts "run_after is now #{job.run_after}"
'
# then wait for the worker to pick it up
```

**Option C — Trigger the real parent action** (true end-to-end; needs real fixture records).

After triggering, verify by querying the resulting record's status, and check any
prerequisite template/config row exists first — a missing template usually makes the
whole thing silently no-op, which looks identical to "the feature is broken."

Option B mutates staging data. That is allowed (see `references/environments.md`), but
print the query and its intent first so the transcript shows what changed. Never reach
for Option B on production — the read-only guard will refuse it.

---

```bash
node .claude/skills/qa-agent/scripts/playwright-driver.cjs \
  --config /tmp/qa-agent-driver-{TICKET_KEY}.json \
  > /tmp/qa-agent-driver-{TICKET_KEY}-result.json
```

Map the per-URL `verdict` in the driver output to per-AC verdicts:
- driver `PASS` → 🟢 for the matching AC
- driver `FAIL` → 🔴 for the matching AC, copy `failures[]` strings into Blocking Findings verbatim
- driver setup failure (exit 2) or `BROWSER_AVAILABLE=false` → ⏸ BLOCKED for all browser ACs, run test-runner / DB-query ACs only

On exit 2, read the driver's stderr line before reporting. `login failed:` means the QA account's credentials are stale — that is a **config** problem, and the report must say so rather than implying the feature is broken. `could not resolve playwright` means the environment needs setup. Either way the browser ACs are BLOCKED, not FAILED.

Also check `stepsRun` on any stepped URL: a value like `"3/6"` means the flow broke partway, and the step index in `failures[]` names exactly where. Quote it — "step[3] click (button:has-text('Save')): timeout" is an actionable bug report; "the save didn't work" is not.

### Map-bearing URL guardrail

If the PR diff touches geojson / region / map code (heuristic: `**/*geojson*`, `**/regions/**`, `**/*map*` in `CHANGED_FILES`) OR any URL matches `/map/*` / `/map-data/*`, the driver MUST be called with `expectMap: true` on those URLs. If `expectMap` is omitted on a map-bearing URL, the AC is downgraded to 🟡 PARTIAL with the explicit note "browser map check skipped" in Blocking Findings.

### Mutation-path guardrail

If the PR diff changes a create / update / delete path, the driver config MUST include a `steps` block that exercises it. Heuristics on `CHANGED_FILES` and the diff body:

- A controller gains or changes `create` / `update` / `destroy` (or a route maps to one)
- A form component, `<form>`, or submit handler is touched
- A `fetch(` / `axios` / `$.ajax` call with a non-GET method appears in the diff
- A model gains a validation, callback, or `before_save`-family hook
- A mailer or background job is triggered by a user action

When any of these hit and the driver ran with **no** `steps` on any URL:
- Cap the overall verdict at 🟡 PARTIAL
- Add to Blocking Findings: `mutation path not exercised — {file} changes {action} but no interactive step was run`
- Set `interactive_coverage: false` in the context write

Record `interactive_coverage: true` when at least one stepped URL ran on a mutation-touching PR.

This exists because of a real escape: a Vue `fetch` used lowercase `method: "patch"`, which the Fetch spec does not normalize, so Rails rejected it with a 400. Request specs passed (Rack routes internally, case-insensitively) and navigation-only verification passed (the request never fired). The bug reached production through a green QA gate. One `click` on Save would have surfaced it four different ways.

### Per-AC classification (after the bucket runs)

- 🟢 PASS — all assertions green, no console errors related to the AC
- 🟡 PARTIAL — assertions green but with caveats (warning log, slow load, minor UX nit, OR map-bearing URL hit without `expectMap`)
- 🔴 FAIL — driver returned FAIL for the URL, OR test runner failed, OR DB query returned unexpected result
- ⏸ BLOCKED — couldn't run the AC (env down, missing data, Playwright/Chromium missing)

If `BROWSER_AVAILABLE=false`: every browser AC is ⏸ BLOCKED. Run only the test-runner / DB-query ACs.

Aggregate to overall verdict — evaluate in this order, first match wins:

| # | Condition | Overall |
|---|---|---|
| 1 | Any AC is 🔴 | 🔴 FAIL |
| 2 | Any AC is ⏸ | ⏸ BLOCKED |
| 3 | Any AC is 🟡 | 🟡 PARTIAL |
| 4 | Every AC is 🟢 | 🟢 PASS |

FAIL outranks BLOCKED: a confirmed failure is a fact, and one unrunnable AC does not soften it. BLOCKED outranks PARTIAL because an unverified AC is a bigger unknown than a caveat on a verified one.

## Phase 2B — Execute (Bug-fix Mode)

Replay the `REPRO_STEPS` exactly:
1. For each step, perform via **Shared: Browser Driver** or `DB_QUERY_CMD`
2. At the assertion point (the step that previously failed), capture:
   - Screenshot
   - Console / network state
   - DB state if relevant
3. Compare actual vs. the original ticket's "Expected" (or "Actual" — whichever describes the bug):
   - Bug **gone** (matches Expected) → 🟢 PASS
   - Bug **partial** (different symptom but related issue still present) → 🟡 PARTIAL
   - Bug **still reproduces** → 🔴 FAIL
   - Couldn't run → ⏸ BLOCKED
4. Run any targeted test that was added to the PR for this bug (look at `CHANGED_FILES` for `_spec.rb` / `*.test.ts` / similar). If it passes → reinforces PASS. If it fails → downgrades to FAIL.

## Phase 3 — Render the Verdict Report

```
## Verify Report — {TICKET_KEY} / PR #{PR_NUMBER}

### Verdict
{🟢 PASS | 🟡 PARTIAL | 🔴 FAIL | ⏸ BLOCKED} — {one-sentence justification}

### Mode
{Feature: walked {N} ACs} or {Bug-fix: replayed {N}-step repro}

### Per-AC / Per-step Results
| # | Result | Description | Evidence |
|---|---|---|---|
| AC-1 | 🟢 | User can save a draft | screenshot, spec |
| AC-2 | 🔴 | Draft persists after reload | screenshot, console error |
...

### Test Suite
- BE: {N} tests in {files}, {passed/failed}
- FE: ...
- E2E: ...

### Coverage
What was actually exercised — name anything that was not:
| Surface | Exercised? | Detail |
|---|---|---|
| Test runner | ✅ | 72 examples, 0 failures |
| DB queries | ✅ | 3 read-only assertions |
| Browser — navigation | ✅ | 4 URLs, 0 console errors |
| Browser — interaction | ❌ | no mutation ACs in this PR |
| Auth-gated surfaces | ⏸ | browser_login not configured |

A ❌ or ⏸ row is not a footnote — if a surface the PR touches went unexercised, that belongs in the verdict justification too.

### Blocking Findings (only on FAIL)
- {plain-text finding — quote driver `failures[]` verbatim, including the step index}
- ...

### Evidence
- .claude/skills/qa-agent/state/evidence/{TICKET}/2026...-ac-1-save.png
- .claude/skills/qa-agent/state/evidence/{TICKET}/2026...-ac-2-reload.png
- Console errors: 2 (see {file path})
- Network failures: 0

### Next Action
- 🟢 PASS → ready to merge; move the ticket to {QA_PASSED_STATE} yourself
- 🟡 PARTIAL → ready to merge, but raise the caveats with dev/PM; move the ticket to {QA_PASSED_STATE} yourself
- 🔴 FAIL → ticket transitioned to {QA_FAILED_STATE}, regression bug filed as {NEW_BUG_KEY}
- ⏸ BLOCKED → no transition; resolve the blocker and re-run /qa-agent verify
```

## Phase 4 — Comment on the Ticket

Never auto-transition a ticket to the passed state — a human moves it to `QA_PASSED_STATE` after reviewing the verdict. QA-agent only comments on PASS/PARTIAL (and, on FAIL, moves the ticket to the failed state so the dev picks it back up).

| Verdict | Action |
|---|---|
| 🟢 PASS | Do **not** change the ticket state. Add a brief PASS comment to the ticket: "QA verified — see report above." (or paste a condensed report) |
| 🟡 PARTIAL | Do **not** change the ticket state. Add a comment listing each caveat. |
| 🔴 FAIL | Transition to `QA_FAILED_STATE` per **Shared: Tracker Detection** Step 5. Add a comment listing the blocking findings. Hand off to `bug` mode (Phase 5) to file a regression ticket linked to this one. |
| ⏸ BLOCKED | No transition. Add a comment explaining the blocker and what needs to happen. |

## Phase 5 — File a Regression Bug on FAIL

If verdict is 🔴 FAIL, offer to file a linked regression ticket. **Filing creates a real ticket that a real person will triage — show it before creating it.**

Render the proposed ticket (title, severity, repro steps, blocking findings) and ask:

```
🔴 FAIL on {TICKET_KEY}. Proposed regression ticket:

  Title:    {title}
  Severity: Sev {N} — {justification}
  Links to: {TICKET_KEY}

  {repro steps}

File it? (yes / edit / no)
```

- `yes` → file it
- `edit` → take the user's amendments, re-render, ask again
- `no` → skip filing; the ticket still moves to `QA_FAILED_STATE` and the report still lists the findings

**In `SWEEP_MODE=active`, skip the prompt and file automatically** — sweep is explicitly a batch operation the user already confirmed at its scope-preview gate, and blocking on N prompts defeats it. Sweep's final summary lists every ticket it filed so the batch stays reviewable after the fact.

To file, read `modes/bug.md` and execute its filing logic (Phase 6 onward) with these inputs:
- Description = the verify report's **Blocking Findings** + **Per-AC Results** sections
- Repro steps = the failing AC's driver `steps` array rendered as prose, or the repro that still triggers in bug-fix mode. A stepped AC gives you exact repro steps for free — use them rather than paraphrasing.
- Evidence = the driver's `failures[]`, screenshots, and `-step-failure.png` path
- Severity = inferred via **Shared: Severity Triage**
- Linked-to ticket = the original `TICKET_KEY` (set as parent or relation depending on tracker)
- Skip the dedup search — the failure is already linked to the parent ticket

Capture the new bug's key as `NEW_BUG_KEY` and substitute it into the report's "Next Action" section.

## Phase 6 — Post to Slack (only on FAIL or BLOCKED)

If verdict is 🔴 FAIL or ⏸ BLOCKED, post to Slack per **Shared: Slack Thread**. PASS / PARTIAL produce only an in-chat report and a ticket comment — they do not Slack-spam the channel.

## Phase 7 — Write Context

Write per **Shared: Session Context** — `verify` key:
- `pr_number`, `pr_url`, `type` (`feature` | `bug-fix`), `result` (`PASS` / `PARTIAL` / `FAIL` / `BLOCKED` — **these four only**; anything else goes in `notes`)
- `ac_verdicts` — array of `{id, result, evidence: [paths]}` for feature mode
- `repro_replay` — array of `{step, result}` for bug-fix mode
- `interactive_coverage` — `true` if at least one stepped URL ran, `false` if the PR touched mutation code without one, `null` if no mutation code was touched
- `blocking_findings` — array of plain strings (emoji stripped) for FAIL only
- `notes` — anything that doesn't fit a field above (e.g. "fix pushed, CI still running")
- `timestamp`
- If FAIL and a bug was filed → also write `bug.filed_ticket = NEW_BUG_KEY`

Also write `stack` with a real `lockfile_mtime` if the stack was re-detected this run — see **Shared: Session Context** → *Stack detection cache*.

## Phase 8 — Prune Evidence

Evidence accumulates fast (a stepped AC writes 3+ screenshots). Prune anything older than 30 days:

```bash
find .claude/skills/qa-agent/state/evidence -type f -mtime +30 -delete 2>/dev/null
find .claude/skills/qa-agent/state/evidence -type d -empty -delete 2>/dev/null
```

Report one line if anything was removed. This is a required step, not a suggestion.
