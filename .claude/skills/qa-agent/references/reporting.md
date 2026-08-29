# Shared: Reporting, Verdicts & Slack

Covers the verdict vocabulary, severity triage, Slack posting, the Session State block, and the internal analysis frame. Load this whenever a mode is about to produce a verdict or post output.

---

## Verdict Format

Standardized across every mode that produces a verdict.

| Verdict | Symbol | Meaning |
|---|---|---|
| PASS | 🟢 | All checks green — feature meets ACs / bug is gone / env is healthy |
| PARTIAL | 🟡 | Passes the spec but with caveats — UX nit, perf concern, minor polish needed |
| FAIL | 🔴 | Clear regression / AC miss / bug reproduced / critical smoke check down |
| BLOCKED | ⏸ | Couldn't run the verdict — env down, missing data, MCP unreachable, prerequisite skipped |

**BLOCKED is never a soft PASS.** If a surface could not be exercised, it is BLOCKED and the report says which surface and why. A run where the browser bucket was BLOCKED and only unit tests ran is not a 🟢 — it is a 🟢 with an explicit "browser surface not verified" line, or a ⏸ if the ACs were primarily browser ACs. Reporting an unverified surface as verified is the single worst failure mode of this skill.

Every verdict carries an **Evidence** section with:
- Screenshot paths (from `references/browser-driver.md`)
- Test command output (last 50 lines on failure, summary on pass)
- DB query results (formatted as a table)
- Console/network failure dumps (only on FAIL)
- Log snippets if surfaced from staging/production

Reports also include:
- **Verdict line** — the symbol + word + one-sentence justification
- **AC checklist** (for `verify` feature mode) — each AC with its own per-AC verdict
- **Repro steps** (for `verify` bug mode and `bug` mode) — exact steps used, in order, with one-line outcome each
- **Coverage line** — which surfaces were actually exercised: test-runner / DB / browser-navigation / browser-interaction. Name the ones that were not.
- **Next action** — what should happen now (merge / re-fix / file a bug / discuss / re-deploy)

---

## Severity Triage

When `bug` files a ticket (or `verify` auto-files on FAIL), classify severity using these signals:

| Severity | Signals |
|---|---|
| **Sev 1** | Production outage, data loss/corruption, security breach, payment processing broken, login broken for all users |
| **Sev 2** | Broken core feature with no workaround; many users affected; critical business flow blocked |
| **Sev 3** | Degraded UX with workaround available; subset of users affected; non-critical feature broken |
| **Sev 4** | Cosmetic, copy, alignment, accessibility nits, edge-case-only |

Decision rules:
- Default to `bug_priority_default` if signals are inconclusive.
- Production env + DB write side-effect → **Sev 1** automatically.
- Affects authentication / authorization / payments → escalate one level above signal-based estimate.
- Hits only on a single record / single user → demote one level.

Map severity to tracker priority field:
- Linear: 1 → `Urgent`, 2 → `High`, 3 → `Normal`, 4 → `Low`
- Jira: 1 → `Highest`, 2 → `High`, 3 → `Medium`, 4 → `Low`

---

## Slack Thread

Used in `verify` (on FAIL or BLOCKED), `bug`, `smoke`, `sweep`. If Slack MCP fails: note in report and continue — never abort.

If `slack_channel` is unset or blank, skip all Slack posting and note `⊝ Slack not configured` once in the report. Do not prompt for it mid-run.

### Mode A — Channel mode (default)

When `slack_thread_ts` is **unset**:

1. Resolve `SLACK_GROUP_ID`:
   - If `slack_group` is unset/blank → `SLACK_GROUP_ID=none`. Skip lookup. The thread reply omits the group mention.
   - Otherwise look up via Slack MCP. Cache for the session on success.
2. Post parent to `{slack_channel}` (use as `channel_id` in `slack_send_message` — accepts a channel name with `#` prefix or a channel ID like `C0B1KEBJF24`) with the appropriate verdict header:
   ```
   🟢 PASS — [Ticket] Summary
   Ticket: {ticket_url}
   Evidence: {N} screenshots attached as thread replies
   ```
   Replace 🟢 PASS with the actual verdict. Capture the returned `ts` as `PARENT_TS`.
3. Reply in thread (`channel_id={slack_channel}`, `thread_ts=PARENT_TS`):
   - Attach screenshots / evidence files (one per reply if many).
   - Add a brief plain-language summary (2–4 sentences). If `SLACK_GROUP_ID≠none`, mention `<!subteam^{SLACK_GROUP_ID}>` on FAIL to ping the QA group; omit on PASS.
   - For sweep runs, vary the framing each ticket — same angle palette as dev-agent (mystery solved / countdown / challenge / celebration / behind-the-scenes).

### Mode B — Pinned-thread mode

When `slack_thread_ts` is **set**:

1. Resolve `SLACK_GROUP_ID` (same as Mode A).
2. Post the verdict header **as a thread reply** under the pinned parent (`channel_id={slack_channel}`, `thread_ts={slack_thread_ts}`):
   ```
   🟢 PASS — [Ticket] Summary
   Ticket: {ticket_url}
   ```
   Do **not** post a new parent message in the channel. The pinned `slack_thread_ts` IS the parent for every qa-agent invocation.
3. Continue replying in the same pinned thread with screenshots, evidence summaries, and group mentions per Mode A's Step 3 rules. All replies share the same `thread_ts={slack_thread_ts}`.

Pinned-thread mode keeps every qa-agent run consolidated in one Slack thread. Use it when QA output is a low-volume side stream that shouldn't fragment a busier channel — typical for solo-QA workflows.

### Common rules

Never write the literal placeholder `<!subteam^GROUP_ID>` if the lookup failed.

---

## Session State Block

At the end of Phase 0 in every mode, print a Session State block before proceeding. Surfaces what was resolved so the user can catch misdetections early.

```
## Session State
TRACKER={jira|linear} | TICKET_KEY={value} | ENV={local|staging|production}
BE_TEST_CMD={value} | FE_TEST_CMD={value} | E2E_FRAMEWORK={value}
ENV_BASE_URL={value}
[context] loaded {TICKET} (last touched Nm ago)        ← only if context file was found
[browser] driver ready | login configured               ← only when relevant
```

Only include variables resolved in the current mode's Phase 0. Use `none` for variables explicitly resolved to none.

---

## Analysis Frame

Mode files contain `<analysis>` blocks in their Phase 1 sections. These are **internal reasoning scaffolds — never output them literally**. Use the structure to frame your thinking, then produce only the result described in the Report or Execute section that follows.

```xml
<!-- Example — do not output this block, use it to reason -->
<analysis>
  <context>...</context>
  <files>...</files>
  <task>...</task>
  <constraints>...</constraints>
</analysis>
```

After invisible reasoning: go directly to visible output (verdict header, report section, or first action) with no transition text.
