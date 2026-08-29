# sweep

Batch QA across the Ready-for-QA queue. Calls `verify` per ticket with checkpoint/resume, so a partial run can be picked up later. Posts a single summary thread to Slack at the end.

## When to use

- End of sprint — clear out everyone's Ready-for-QA pile in one pass
- Daily morning routine on a high-throughput team
- After a bulk dev push — multiple tickets land at once
- Before a sprint demo — ensure the queue is current

## Usage

```
/qa-agent sweep                ← process all tickets in qa_ready_state
/qa-agent sweep --resume       ← resume a previously interrupted sweep
/qa-agent sweep --dry-run      ← list what would be processed; do not run verify
```

## What happens, step by step

### 1. Setup
- Reads config, resolves tracker, checks for an existing checkpoint
- If a checkpoint exists, asks: resume or start fresh?

### 2. Build the queue
- Fetches all open tickets in `qa_ready_state`
- For each, auto-resolves the most likely PR via `gh pr list --search`
- Tickets with ambiguous PRs are queued with a "skip" reason (you can override)

### 3. Show scope preview
Prints the queue and asks for confirmation:
```
| # | Ticket | PR | Title | Status |
|---|---|---|---|---|
| 1 | BRGY-46 | #519 | Add branch manager | ✅ queued |
| 2 | BRGY-01 | — | Bug: foo | ⏸ skip (ambiguous PR) |
| 3 | BRGY-12 | #524 | Refactor user service | ✅ queued |

Reply 'go', 'edit N' (skip or set PR), or 'cancel'.
```

If `--dry-run`: stops here.

### 4. Initialize checkpoint
Writes `.claude/skills/qa-agent/state/sweep-checkpoint.json` with the queue and progress index.

### 5. Process each ticket
For each queued ticket:
- Calls `verify` with `SWEEP_MODE=active` (suppresses interactive prompts)
- Captures the verdict and any auto-filed bug
- Updates the checkpoint after each ticket — interruptions are safe to resume from

### 6. Final summary report
```
## Sweep Summary — 2026-05-01

### Tally
| Verdict | Count |
|---|---|
| 🟢 PASS | 8 |
| 🟡 PARTIAL | 1 |
| 🔴 FAIL | 2 |
| ⏸ BLOCKED | 1 |

Total: 12 tickets, 14m elapsed.

### Per-ticket
| # | Ticket | PR | Verdict | Filed bug | Detail |
|---|---|---|---|---|---|
| 1 | BRGY-46 | #519 | 🟢 | — | All 3 ACs passed |
| 2 | BRGY-12 | #524 | 🔴 | BRGY-50 | AC-2 failed |
...

### Filed Bugs
- BRGY-50 — Draft did not persist (Sev 2)
```

### 7. Single Slack summary
One parent message + threaded per-ticket detail. Never spams the channel per-ticket.

### 8. Archive checkpoint
On clean completion, the checkpoint is renamed to `sweep-history-{date}.json`. Last 30 are kept.

## Behavior on errors

- A single ticket's `verify` failure (uncaught exception, MCP timeout) is captured as `verdict: ERROR` for that ticket — the sweep continues
- Interruptions (Ctrl+C, session ends) leave a valid checkpoint — `--resume` picks up exactly where you left off
- The same project cannot run two sweeps in parallel — the second invocation will see the first's checkpoint and prompt to resume

## Guardrails

- **Always asks before processing** — scope preview + confirmation before any verify runs
- **Interactive prompts suppressed during sweep** — verify defaults to "go" instead of asking; manual review happens via the per-ticket evidence in the final report
- **Sweep runs against local only** — for env-specific verification, use `verify` directly with `--env staging`
- **Single Slack post** — never spams the channel per-ticket; one parent message at the end with a threaded per-ticket table

## Before / After

| | Run |
|---|---|
| Before | Some tickets sitting in `qa_ready_state` |
| After | Each ticket transitioned to `qa_passed_state` or `qa_failed_state`; regression bugs filed for failures; one Slack summary posted |
