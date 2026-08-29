# Mode: plan

## Usage

```
/qa-agent plan [ticket key or URL]
```

Read a ticket and produce a test plan: AC checklist, positive cases, negative cases, edge cases, regression risks, data dependencies. Posts the plan as a comment on the ticket and saves it to per-ticket context for `verify` to consume later.

**When to use:**
- A ticket has thin / ambiguous acceptance criteria and you want to firm them up before dev starts.
- You're about to implement tests upfront (TDD) and want a written plan.
- You want a paper trail of "what QA will check" attached to the ticket.

**Examples:**
```
/qa-agent plan BRGY-46
/qa-agent plan https://adelacruz.atlassian.net/browse/BRGY-41
/qa-agent plan BRGY-71
```

---

## Phase 0 — Setup

Read config. Resolve `TRACKER` per **Shared: Tracker Detection** (Steps 1–2). Run the **Tracker MCP pre-flight** (Step 3).

Derive `TICKET_KEY` from the input per **Shared: Tracker Detection** Step 4. If the input doesn't match a recognized pattern: stop with `⛔ Could not parse ticket key from input. Expected a key like BRGY-46 or a Linear/Jira URL.`

Fetch ticket details per **Shared: Tracker Detection** Step 5. If not found: stop with `⛔ Ticket {TICKET_KEY} not found in {TRACKER}.`

Read context per **Shared: Session Context** — load if present.

Run **Shared: Test Stack Detection** (cached if `stack` was loaded from context and lockfile mtime matches).

**Print Session State** (see SKILL.md):
```
## Session State
TRACKER={value} | TICKET_KEY={value}
BE_TEST_CMD={value} | FE_TEST_CMD={value} | E2E_FRAMEWORK={value}
[context] loaded {TICKET_KEY} (last touched Nm ago)   ← only if found
```

## Phase 1 — Analyze the Ticket

```xml
<analysis>
  <context>
    Ticket title, description, type (feature / bug / chore / spike), priority,
    declared acceptance criteria (if any), linked Figma / specs / parent epic,
    comments that reveal hidden requirements, attached screenshots.
  </context>
  <files>
    Likely affected files inferred from the ticket — controller / model / page / component
    candidates. Read at most 3 files to ground the plan in reality. Do not modify anything.
  </files>
  <task>
    1. Extract / refine the AC list. If the ticket has no explicit AC, derive one from the description.
    2. Generate positive test cases (happy paths covering each AC).
    3. Generate negative test cases (invalid input, unauthorized, missing data, timeout).
    4. Generate edge cases (empty / max / boundary / unicode / concurrent / role-specific).
    5. Identify regression risks — files / features that could break as a side effect.
    6. List data dependencies (seed records, feature flags, integrations) needed to run the tests.
  </task>
  <constraints>
    - Stay grounded in the ticket text and the (read-only) code peek. Do not invent ACs unsupported by the ticket.
    - Prefer specific, runnable cases ("Submit form with email field empty" > "Test invalid input").
    - Keep edge cases relevant to the feature surface — don't pad with generic suggestions.
    - Each AC should map to at least one positive case and (where applicable) one negative case.
  </constraints>
</analysis>
```

## Phase 2 — Render the Plan

Produce the plan in this exact markdown structure (this is what gets posted to the ticket):

```
## QA Test Plan — {TICKET_KEY}: {ticket title}

### Acceptance Criteria
- [ ] AC-1: {explicit AC text or derived AC}
- [ ] AC-2: ...

### Positive Cases
1. **{Name}** — Steps: {1-3 short steps}. Expected: {observable outcome}. Maps to: AC-{N}.
2. ...

### Negative Cases
1. **{Name}** — Steps. Expected error/state. Maps to: AC-{N}.
2. ...

### Edge Cases
1. **{Name}** — Why it matters. Steps. Expected. Maps to: AC-{N} (or "regression-only").
2. ...

### Regression Risks
- {File / feature} — {why it might break}.
- ...

### Data Dependencies
- {Seed: e.g. "Admin user with role=manager"}.
- {Feature flag: e.g. "branch_manager_v2 enabled"}.
- {Third-party: e.g. "Stripe test key"}.
- ...

### Out of Scope
- {What this plan deliberately does not cover}.
```

## Phase 3 — Post to Ticket

Post the rendered plan as a comment on the ticket per **Shared: Tracker Detection** Step 5 (`addCommentToJiraIssue` for Jira, `Linear-create_comment` for Linear). If the comment fails: print the rendered plan inline so the user can paste manually, note the failure, skip Phase 3.5, and continue to the context write.

Capture the returned `id` and `url` (or construct the URL from `{ticket_url}#comment-{id-prefix-8}` for Linear) as `COMMENT_ID` and `COMMENT_URL` for the next phase.

## Phase 3.5 — Append discoverability footer to ticket description

After the comment lands, append a one-line footer to the ticket description so anyone scanning the ticket can find the QA plan without scrolling through comments. **Read the current description first** (re-fetch via `Linear-get_issue` / `getJiraIssue` to avoid clobbering concurrent edits), then append:

```
---

**QA Plan:** see [comment by qa-agent]({COMMENT_URL}){optional-tldr}
```

Where `{optional-tldr}` is one of:
- ` (N critical regression risks flagged)` — if any regression risks contain ⚠️ / "CRITICAL" / "must decide"
- empty otherwise

If the description already contains a `**QA Plan:**` line (from a prior `plan` run), **replace** it in place rather than appending a second one. Match on the literal substring `**QA Plan:**` to find and replace through the end of that line.

If the description update fails (permission error, network): note in the report and continue. The comment is still posted; the footer is best-effort.

**Why two artifacts?** Comment carries the full plan (long, detailed, append-only history when re-run). Description footer carries one line for discoverability. Anyone scanning the ticket sees the QA plan exists; anyone wanting details clicks through.

## Phase 4 — Write Context

Write per **Shared: Session Context**:
- `qa_plan.timestamp` — current ISO8601
- `qa_plan.ac_checklist` — array of `{id: "ac-N", text: "..."}`
- `qa_plan.positive_cases`, `negative_cases`, `edge_cases`, `regression_risks`, `data_dependencies` — arrays of plain strings
- `stack` — if re-detected this run

## Phase 5 — Report

Print to chat:
```
## QA Plan — {TICKET_KEY}
✅ Posted to ticket: {ticket_url}
✅ Saved to context: .claude/skills/qa-agent/state/context/{TICKET_KEY}.json

Summary: N ACs, M positive cases, K negative cases, J edge cases, L regression risks.

Next:
  - Dev implements the feature
  - When dev marks the ticket {QA_READY_STATE}: /qa-agent verify {TICKET_KEY} [PR]
```
