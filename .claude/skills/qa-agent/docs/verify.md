# verify

The core QA gate. Validates that a Ready-for-QA ticket actually meets its acceptance criteria (for features) or that the original failure is gone (for bug-fixes). Captures live evidence via Playwright + DB queries + targeted test runs, returns a single verdict, comments on the ticket (and on FAIL moves it back to the failed state — never auto-transitions to the passed state), and on FAIL offers to file a linked regression ticket.

Browser verification is real: it logs in, navigates, clicks, and fills forms, so mutation paths actually fire rather than being inferred from a page load.

## When to use

- A dev marks a ticket Ready for QA — run `verify` to give the formal pass/fail
- You want a verdict with evidence, not just a "looks good"
- The PR claims to fix a bug and you want to confirm the original failure is actually gone

## Usage

```
/qa-agent verify [ticket key or URL] [PR link or number] [--env local|staging|production]
/qa-agent verify [ticket key or URL]   ← PR auto-inferred if exactly one open PR mentions the ticket
```

```
/qa-agent verify BRGY-46 519
/qa-agent verify BRGY-01 524 --env staging
/qa-agent verify BRGY-71    ← PR auto-inferred
```

## Auto-detects feature vs. bug-fix

| Signal | Mode |
|---|---|
| Ticket type = `Bug`, OR description has a Steps-to-Reproduce / Repro section | **Bug-fix mode** — replay the original failure |
| Otherwise | **Feature mode** — walk the AC checklist |

## What happens, step by step

### 1. Setup
- Reads config, resolves tracker, fetches ticket
- Auto-infers PR if not provided
- Resolves env target (defaults to local)
- Loads the QA plan from context if `plan` ran previously
- Prepares Playwright browser session

### 2. Plan the verification
Maps each AC (feature mode) or each repro step (bug-fix mode) to:
- URL(s) to visit
- User actions
- Assertions (text / element / URL / DB state)
- Screenshots to capture
- Targeted tests to run

### 3. Execute (feature mode)
ACs are sorted into four buckets and each is run the right way:

| Bucket | How it's verified |
|---|---|
| Test-runner | Existing specs for the AC's affected code |
| DB-query | Read-only assertions via `rails runner` / equivalent |
| Browser — navigation | Page loads, asserts status / console / text / map / JSON shape |
| Browser — interaction | Real clicks and form fills via the driver's `steps`, so save/delete paths actually fire |

Logs in first (`browser_login`) when an AC needs a signed-in user. Captures a screenshot per AC, plus a `-step-failure` screenshot at the exact point an interaction breaks.

Per-AC verdict: 🟢 PASS / 🟡 PARTIAL / 🔴 FAIL / ⏸ BLOCKED

**Any AC whose wording is a verb — save, create, delete, submit, toggle, upload — belongs in the interaction bucket.** Verifying it by page load only proves the form rendered, not that it works.

### 3. Execute (bug-fix mode)
- Replays the ticket's Steps-to-Reproduce exactly
- Captures evidence at the failure point
- Compares actual vs. the ticket's "Expected"
- Verdict: 🟢 (bug gone) / 🔴 (still reproduces) / 🟡 (different but related issue) / ⏸ (blocked)

### 4. Aggregate verdict
First match wins, in this order:

1. Any AC 🔴 → 🔴 **FAIL** (a confirmed failure outranks an unrunnable one)
2. Any AC ⏸ → ⏸ **BLOCKED** (an unverified AC is a bigger unknown than a caveat)
3. Any AC 🟡 → 🟡 **PARTIAL**
4. Every AC 🟢 → 🟢 **PASS**

The report also carries a **Coverage** table naming every surface that was *not* exercised. A PASS with an unexercised surface says so on its face.

### 5. Comment on the ticket
- 🟢 PASS / 🟡 PARTIAL → comments only; does **not** change the state (move it to `qa_passed_state` yourself)
- 🔴 FAIL → moves to `qa_failed_state` (e.g. "In Progress")
- ⏸ BLOCKED → no transition; explains the blocker

### 6. Auto-file regression bug on FAIL
If verdict is 🔴: hands off to `bug` mode to file a regression ticket linked to the original. Severity inferred from impact signals.

### 7. Slack (only on FAIL or BLOCKED)
Posts to your QA channel with the verdict and evidence links. PASS / PARTIAL produce only an in-chat report and a ticket comment — they do not Slack-spam.

## What you'll see

```
## Verify Report — BRGY-46 / PR #519

### Verdict
🟢 PASS — all 3 ACs passed with browser evidence

### Mode
Feature: walked 3 ACs

### Per-AC Results
| # | Result | Description | Evidence |
|---|---|---|---|
| AC-1 | 🟢 | User can save a draft | screenshot, spec |
| AC-2 | 🟢 | Drafts persist after reload | screenshot |
| AC-3 | 🟢 | Drafts can be promoted | screenshot, spec |

### Test Suite
- BE: 12 specs in 3 files, all passed
- FE: 8 tests in 2 files, all passed

### Evidence
- .claude/skills/qa-agent/state/evidence/BRGY-46/2026...-ac-1-save.png
- .claude/skills/qa-agent/state/evidence/BRGY-46/2026...-ac-2-reload.png
- ...

### Next Action
🟢 PASS → ready to merge (move the ticket to Passed QA yourself)
```

## Guardrails

- **Production is read-only** — DB queries against production refuse writes (see `references/environments.md`)
- **No Playwright** — falls back to test-runner + DB-only verification, with browser ACs marked ⏸ BLOCKED and named as such. Never a silent pass.
- **Login failure is BLOCKED, not FAIL** — a stale QA password is a config problem; the report says so instead of implying the feature broke
- **Mutation guardrail** — a PR touching create/update/delete with no interactive step is capped at 🟡 PARTIAL
- **No tracker MCP, no run** — verify requires a tracker; will stop early if MCP is unreachable
- **Bug filing is confirmed** — on FAIL you see the proposed ticket before it's created (auto-files only inside `sweep`, which you already confirmed at its scope gate)
- **Read-only by default in chat** — you see the verdict before any ticket transitions

## Before / After

| | Run |
|---|---|
| Before | Dev marks ticket Ready for QA; you have the ticket key (PR auto-inferred) |
| After: 🟢 PASS | Ready to merge; move the ticket to Passed QA yourself |
| After: 🔴 FAIL | Ticket → back to dev with regression bug filed |
| After: ⏸ BLOCKED | Resolve blocker (env, data, MCP) and re-run |
