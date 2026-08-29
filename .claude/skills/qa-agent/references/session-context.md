# Shared: Session Context

Persists findings across mode runs for the same ticket so modes can hand off results directly.

## Context File Location

**Per-ticket:** `.claude/skills/qa-agent/state/context/{TICKET_KEY}.json`

**Sweep checkpoint:** `.claude/skills/qa-agent/state/sweep-checkpoint.json` (separate file, owned by `sweep` mode).

All under `.claude/skills/qa-agent/state/`, which is gitignored by the skill's own `.claude/skills/qa-agent/.gitignore`. Nothing is written to the project root `.gitignore`.

## Schema (per-ticket)

```json
{
  "ticket": "BRGY-46",
  "stack": {
    "be_test_cmd": "bundle exec rspec",
    "fe_test_cmd": "yarn test",
    "e2e_framework": "playwright",
    "detected_at": "<ISO8601>",
    "lockfile_path": "Gemfile.lock",
    "lockfile_mtime": 1754500000
  },
  "qa_plan": {
    "timestamp": "<ISO8601>",
    "ac_checklist": [
      { "id": "ac-1", "text": "User can save a draft" }
    ],
    "positive_cases": [],
    "negative_cases": [],
    "edge_cases": [],
    "regression_risks": []
  },
  "verify": {
    "timestamp": "<ISO8601>",
    "pr_number": 519,
    "pr_url": "https://github.com/owner/repo/pull/519",
    "type": "feature",
    "result": "PASS",
    "ac_verdicts": [
      { "id": "ac-1", "result": "PASS", "evidence": [".claude/skills/qa-agent/state/evidence/BRGY-46/2026...png"] }
    ],
    "interactive_coverage": true,
    "blocking_findings": [],
    "notes": "free text — anything that does not fit a field above"
  },
  "bug": {
    "timestamp": "<ISO8601>",
    "classification": "real_bug",
    "filed_ticket": "BRGY-01",
    "severity": 3,
    "repro_steps": []
  },
  "review": {
    "timestamp": "<ISO8601>",
    "pr_number": 519,
    "verdict": "NEEDS DISCUSSION",
    "inline_comments_posted": 4
  }
}
```

## Enumerated values — do not invent new ones

| Field | Allowed values |
|---|---|
| `verify.result` | `PASS` \| `PARTIAL` \| `FAIL` \| `BLOCKED` |
| `verify.ac_verdicts[].result` | `PASS` \| `PARTIAL` \| `FAIL` \| `BLOCKED` |
| `verify.type` | `feature` \| `bug-fix` |
| `bug.classification` | `real_bug` \| `user_error` \| `env_issue` \| `flake` \| `cannot_reproduce` |
| `bug.severity` | `1` \| `2` \| `3` \| `4` (integer) |
| `review.verdict` | `LGTM` \| `NEEDS DISCUSSION` \| `NEEDS CHANGES` |

If the real-world outcome does not fit — e.g. a fix was pushed and CI has not finished — pick the closest allowed value (`BLOCKED` here) and put the detail in `notes`. Writing a novel value like `FIX_PUSHED_AWAITING_CI` breaks every downstream reader that filters on the enum, including `sweep`'s tally and `config show-context`.

## Stack detection cache

`stack.lockfile_mtime` must hold a **real epoch mtime**, not a placeholder. Compute it from the lockfile that governs the detected stack:

```bash
# macOS/BSD
stat -f %m Gemfile.lock
# Linux
stat -c %Y Gemfile.lock
```

Portable one-liner used by the modes:
```bash
LOCKFILE_MTIME=$(stat -f %m "$LOCKFILE" 2>/dev/null || stat -c %Y "$LOCKFILE" 2>/dev/null || echo 0)
```

Record which file it came from in `stack.lockfile_path` (`Gemfile.lock`, `{FRONTEND_ROOT}/yarn.lock`, `go.sum`, …). If several apply, use the backend lockfile and note the frontend one in `lockfile_path` as a comma-joined list, taking the max mtime.

A stored `0` means "never actually captured" — treat it as a cache miss and re-detect, rather than trusting a cache that was never valid.

## Read Rules (Phase 0)

Check for `.claude/skills/qa-agent/state/context/{TICKET_KEY}.json` at the start of Phase 0:
- If missing: proceed with full detection.
- If present: print `[context] loaded {TICKET_KEY} (last touched <Nm> ago)` in the Session State block. Capture file mtime as `CONTEXT_FILE_MTIME` for concurrent-write detection.

**Stack reuse:** skip Test Stack Detection only if all of these hold:
1. `stack.lockfile_mtime` is non-zero, AND
2. it equals the current mtime of `stack.lockfile_path`, AND
3. `stack.detected_at` is less than 7 days old.

Otherwise re-detect and log which condition failed:
- `[context] stack re-detected (lockfile changed)`
- `[context] stack cache expired (>7 days)`
- `[context] stack cache invalid (no lockfile_mtime recorded)`

## Write Rules

Each mode merges its key into the context file — never replaces the entire file. Read first, update the relevant key, write back.

**Concurrent-run protection:** before writing, check the file's current mtime. If different from `CONTEXT_FILE_MTIME`, log `⚠️ Context file was modified since last read — writing anyway (last-write-wins).` Continue.

| Mode | Writes |
|---|---|
| `plan` | `qa_plan` (ac_checklist, positive_cases, negative_cases, edge_cases, regression_risks, timestamp); `stack` if re-detected |
| `verify` | `verify` (pr_number, pr_url, type, result, ac_verdicts, interactive_coverage, blocking_findings, timestamp); `stack` if re-detected. On FAIL also writes the auto-filed bug into `bug` |
| `bug` | `bug` (classification, filed_ticket, severity, repro_steps, timestamp); `stack` if re-detected |
| `review` | `review` (pr_number, verdict, inline_comments_posted, timestamp); `stack` if re-detected |
| `smoke` | Does not write per-ticket (writes to `.claude/skills/qa-agent/state/smoke-history.json` instead — env, verdict, timestamp) |
| `sweep` | Delegates writes to `verify` and `bug` per ticket. Checkpoint file is separate. |

Write at the **end** of the mode. If the write fails: note in report and continue.

## Retention

Context files are small and worth keeping — do not auto-prune them. Evidence is not: prune it per `references/browser-driver.md` → **Evidence Directory** at the end of any mode that wrote screenshots.
