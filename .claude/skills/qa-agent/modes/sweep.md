# Mode: sweep

## Usage

```
/qa-agent sweep                          ← process all tickets in QA_READY_STATE
/qa-agent sweep --resume                 ← resume a previously interrupted sweep from checkpoint
/qa-agent sweep --dry-run                ← list tickets that would be processed; do not run verify
```

Batch QA across the Ready-for-QA queue. Calls `verify` per ticket with checkpoint/resume so a partial run can be picked up later. Posts a single summary thread to Slack at the end.

**When to use:**
- End of sprint — clear out everyone's Ready-for-QA pile
- After a bulk dev push — multiple tickets land at once
- Daily morning routine on a high-throughput team

**Examples:**
```
/qa-agent sweep
→ Lists open Ready-for-QA tickets, asks for confirmation, then verifies each

/qa-agent sweep --dry-run
→ Just lists and stops — useful for "what's in the queue?"

/qa-agent sweep --resume
→ Picks up where the last sweep left off (if the checkpoint file exists)
```

---

## Phase 0 — Setup

Read config. Resolve `TRACKER` per **Shared: Tracker Detection** (Steps 1–3). Parse args:
- `--resume` → store as `RESUME=true`
- `--dry-run` → store as `DRY_RUN=true`

Check for an existing checkpoint at `.claude/skills/qa-agent/state/sweep-checkpoint.json`:
- File exists AND `RESUME=true` → load and use it
- File exists AND `RESUME=false` → ask: "🔄 Found a sweep checkpoint from {timestamp}. Resume it (y) or start fresh (n)?" — on `y`, treat as `RESUME=true`
- File exists AND user wants fresh → archive the old checkpoint to `.claude/skills/qa-agent/state/sweep-checkpoint-{timestamp}.json.bak`, then proceed fresh

Resolve env: sweep always runs against `local` unless every ticket in the queue has its env explicitly set in metadata. Print: `[env] sweep runs verify against local env. Use /qa-agent verify {TICKET} {PR} --env staging for staging-only verifications.`

**Print Session State**:
```
## Session State
TRACKER={value} | RESUME={true|false} | DRY_RUN={true|false}
```

## Phase 1 — Build the Queue

If `RESUME=true`: load the queue from the checkpoint, skip Phase 1 query.

Otherwise, fetch open tickets in `QA_READY_STATE` per **Shared: Tracker Detection** Step 5:

**Linear:**
```
Linear-list_issues(team=LINEAR_TEAM_ID, state=QA_READY_STATE_ID, limit=50)
```

**Jira:**
```
JQL: {JIRA_PROJECT_CLAUSE} AND status = "{QA_READY_STATE}" ORDER BY priority DESC, updated DESC
```

For each ticket, also resolve the most likely PR:
```bash
gh pr list --search "in:title in:body {TICKET_KEY}" --state open --repo {REPO} --json number,title,headRefName --jq '.'
```
- Exactly one match → set `pr_number` for that ticket
- Zero or multiple → set `pr_number=null` and mark as "needs manual disambiguation"

Build the queue:
```json
[
  { "ticket": "BRGY-46", "pr_number": 519, "title": "Add branch manager", "status": "queued" },
  { "ticket": "BRGY-01", "pr_number": null, "title": "Bug: foo", "status": "queued", "skip_reason": "ambiguous PR" },
  ...
]
```

## Phase 2 — Show Scope Preview & Confirm

Show the queue:
```
## Sweep Queue — {N} tickets in {QA_READY_STATE}

| # | Ticket | PR | Title | Status |
|---|---|---|---|---|
| 1 | BRGY-46 | #519 | Add branch manager | ✅ queued |
| 2 | BRGY-01 | — | Bug: foo | ⏸ skip (ambiguous PR) |
| 3 | BRGY-12 | #524 | Refactor user service | ✅ queued |
...

{queued count} will be verified, {skip count} skipped.

Reply:
  - 'go' to proceed
  - 'edit N' to skip ticket N (or 'edit N pr=525' to manually set its PR)
  - 'cancel' to stop
```

Loop on user input until `go` or `cancel`.

If `DRY_RUN=true`: stop here.

## Phase 3 — Initialize Checkpoint

Write `.claude/skills/qa-agent/state/sweep-checkpoint.json`:
```json
{
  "started_at": "<ISO8601>",
  "queue": [...],
  "completed": [],
  "current_index": 0
}
```

## Phase 4 — Process Each Ticket

For each ticket in the queue (skipping those with `status` other than `queued`):

1. Update checkpoint: `current_index=N`
2. Print divider:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   [{N}/{TOTAL}] {TICKET} — {title}
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```
3. Set session variable `SWEEP_MODE=active` (so verify suppresses interactive prompts)
4. Read `modes/verify.md` and execute its phases with:
   - `TICKET_KEY = ticket.ticket`
   - `PR_NUMBER = ticket.pr_number`
   - `ENV = local`
   - In `SWEEP_MODE`: skip the inline AskQuestion blocking gates; record the verdict and continue
5. Capture the verdict and key fields:
   - `verdict` (PASS / PARTIAL / FAIL / BLOCKED)
   - `pr_number`
   - If FAIL: the auto-filed bug's key
   - Evidence path
6. Update checkpoint with the per-ticket result:
   ```json
   {
     "ticket": "BRGY-46",
     "verdict": "PASS",
     "pr_number": 519,
     "filed_bug": null,
     "completed_at": "<ISO8601>"
   }
   ```
   Append to `completed` array. Bump `current_index`.
7. If verify itself errored (uncaught exception, MCP timeout, etc.):
   - Mark ticket with `verdict: "ERROR"` and `error_detail: "..."`
   - Continue to next ticket — never abort the whole sweep on a single failure

If the sweep is interrupted (user hits Ctrl+C, session ends): the checkpoint already reflects progress, so `--resume` works on the next invocation.

## Phase 5 — Final Summary Report

After all tickets processed, render:
```
## Sweep Summary — {date}

### Tally
| Verdict | Count |
|---|---|
| 🟢 PASS | {N} |
| 🟡 PARTIAL | {N} |
| 🔴 FAIL | {N} |
| ⏸ BLOCKED | {N} |
| ⚠️ ERROR | {N} |

Total: {N} tickets, {duration} elapsed.

### Per-ticket
| # | Ticket | PR | Verdict | Filed bug | Detail |
|---|---|---|---|---|---|
| 1 | BRGY-46 | #519 | 🟢 | — | All 3 ACs passed |
| 2 | BRGY-01 | — | ⏸ | — | Skipped: ambiguous PR |
| 3 | BRGY-12 | #524 | 🔴 | BRGY-50 | AC-2 failed: draft did not persist |
...

### Filed Bugs
- BRGY-50 — Draft did not persist (Sev 2) — {url}
- ...

### Evidence
- Per-ticket evidence directories under .claude/skills/qa-agent/state/evidence/

### Next Action
- 🟢 PASS tickets are ready to ship — move them to {QA_PASSED_STATE} yourself (sweep does not auto-transition on pass)
- 🔴 FAIL tickets are back in {QA_FAILED_STATE} with regression bugs filed
- Re-run /qa-agent sweep tomorrow when devs have addressed the failures
```

## Phase 6 — Post Single Slack Summary

Post once per **Shared: Slack Thread** to `slack_channel`:
```
🧹 QA Sweep — {date}: {N} tickets verified
🟢 {pass} pass · 🟡 {partial} partial · 🔴 {fail} fail · ⏸ {blocked} blocked · ⚠️ {error} error

Filed bugs: {comma-separated list of bug keys with links}
```

Thread reply with the per-ticket table (formatted as a Slack code block).

## Phase 7 — Archive Checkpoint

On clean completion (no errors):
```bash
mv .claude/skills/qa-agent/state/sweep-checkpoint.json .claude/skills/qa-agent/state/sweep-history-{YYYY-MM-DD}.json
```

So a future `--resume` doesn't try to re-run a finished sweep. Keep the last 30 sweep-history files; older are deleted.

## Notes on Concurrency

If two `/qa-agent sweep` invocations happen on the same machine for the same project: the second one will see the first's checkpoint and prompt to resume — they cannot run in parallel. This is intentional — sweep is meant to be a single sequential pass through the queue.
