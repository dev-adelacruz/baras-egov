# Mode: review

## Usage

```
/qa-agent review [PR link or number]
/qa-agent review [PR link or number] --comment   ← post inline GitHub comments
```

PR-time QA-lens review. Reads the diff and looks for things devs systematically miss: untested code paths, missing AC coverage, missing edge cases, regression risk, observability gaps, and missing analytics events. Without `--comment`, prints the findings to chat (read-only). With `--comment`, posts each finding as an inline GitHub comment on the relevant line.

**This is the only qa-agent mode that runs *before* the ticket is marked Ready for QA.** Skip it if your team only engages QA after dev signs off.

**When to use:**
- A teammate opens a PR and you want to apply a QA lens before they hand it over
- You're triaging a "What could break here?" vibe-check on a hot PR
- Sprint retro identifies that bugs are slipping past code review — use as a gate

**Examples:**
```
/qa-agent review 519
→ Read-only findings printed to chat

/qa-agent review https://github.com/dev-adelacruz/baras-egov/pull/519 --comment
→ Same findings, also posted as inline GitHub comments

/qa-agent review 524 --comment
→ Bug-fix PR — focuses on regression risk, side-effect coverage
```

---

## Phase 0 — Setup

Read config. Resolve `TRACKER` per **Shared: Tracker Detection** (Steps 1–3). Parse PR arg → `PR_NUMBER`. Parse `--comment` flag → `POST_COMMENT=true|false`.

Detect ticket from PR:
1. `gh api repos/{REPO}/pulls/{PR_NUMBER}` — read `title` and `body`
2. Search title + body for `[A-Z]+-[0-9]+` matches
3. If exactly one match → `TICKET_KEY=match`, fetch ticket per **Shared: Tracker Detection** Step 5
4. If zero or multiple matches → `TICKET_KEY=none`, log `[ticket] none associated with PR (review will skip AC coverage check)`

Run **Shared: Test Stack Detection**.

Fetch PR data:
```bash
gh api repos/{REPO}/pulls/{PR_NUMBER} --jq '{title, body, base, head, files_url}'
gh api repos/{REPO}/pulls/{PR_NUMBER}/files --jq '.'
```
Store as `PR_META` and `CHANGED_FILES`.

Read context per **Shared: Session Context** if `TICKET_KEY≠none`. If `qa_plan` is present, store ACs as `LOADED_ACS`.

**Print Session State**:
```
## Session State
TRACKER={value} | PR_NUMBER={value} | TICKET_KEY={value|none} | POST_COMMENT={true|false}
BE_TEST_CMD={value} | FE_TEST_CMD={value} | E2E_FRAMEWORK={value}
[context] qa_plan loaded ({N} ACs)   ← only if LOADED_ACS non-empty
```

## Phase 1 — Analyze the Diff

```xml
<analysis>
  <context>
    PR title, body, ticket (if any), AC list (if any). Categorize change type:
    bug-fix, feature, refactor, dep-update, infra. The QA lens depends on type.
  </context>
  <files>
    Group CHANGED_FILES by layer:
    - controllers / endpoints
    - models / domain logic
    - services / interactors / use-cases
    - serializers / response shapes
    - migrations / schema
    - frontend components / pages
    - frontend state / hooks / services
    - tests / specs (added or changed)
    - configs / infra
    Read the diff for each file. Note which lines are most behavior-changing.
  </files>
  <task>
    Find QA-relevant gaps. For each, classify severity (Blocking / Suggestion / Nit) and
    pin to a specific file:line where possible:

    1. **Untested code paths** — production logic added with no test coverage
    2. **Missing AC coverage** — ACs (from ticket / qa_plan) that have no apparent backing change in the diff
    3. **Missing edge cases** — common-sense edge cases not addressed (nil, empty, unauthorized, max length, concurrent, role variants)
    4. **Regression risk** — shared code modified without coverage of existing callers
    5. **Observability gaps** — new error paths with no logging, no Sentry capture, no metric, or no user-facing error message
    6. **Analytics gaps** — new user-facing actions without an analytics event (if the project uses analytics)
    7. **Frontend / backend contract gaps** — API response shape changed but TS types or consuming code unchanged
    8. **Migration / data integrity risk** — destructive migration, NOT NULL added without backfill, dropped column with consumers
    9. **Auth / permission risk** — new endpoint without explicit permission check
    10. **Test quality** — test added but it doesn't actually exercise the new behavior (e.g. mocks the thing under test)
  </task>
  <constraints>
    - One finding = one specific concern, with file:line and a one-line "what to do".
    - Don't lecture on style or formatting — that's lint.
    - Don't surface findings about code that wasn't changed in the diff (that's the audit mode in dev-agent's job).
    - Be specific. "Add tests" is not a finding; "Add a spec for User#suspended? returning false on nil deactivated_at" is.
  </constraints>
</analysis>
```

## Phase 2 — Run Targeted Checks

Beyond static analysis, run these concrete checks against the diff:

### Check A — Test file coverage
For each non-test source file in `CHANGED_FILES`, look for a corresponding test file in the same PR:
- `app/models/foo.rb` → look for `spec/models/foo_spec.rb` or similar
- `src/components/Bar.tsx` → look for `Bar.test.tsx` / `Bar.spec.tsx`

If missing → add a finding: `Missing test coverage for {file}` (Blocking for new features, Suggestion for refactors, Nit for trivial typo fixes).

### Check B — AC coverage matrix (if LOADED_ACS or ticket has ACs)
For each AC, scan the diff for an apparent implementation. Use keyword matching against AC text. If no file in the diff appears to address an AC → add a finding: `AC-{N} not addressed by PR diff: "{ac text}"` (Blocking).

### Check C — Convention sampling
Pick 1–2 closest existing files of the same type and compare patterns. If the PR introduces a new pattern (e.g. new state library, new test style, new error handling shape) without precedent → add a finding (Suggestion).

### Check D — Migration safety
If any file is `db/migrate/*.rb` or equivalent:
- Adds NOT NULL → flag if no backfill data step or default value
- Removes a column → flag if grep'ing the codebase still finds references
- Adds an index on a large table → flag for `algorithm: :concurrently` (Postgres) or equivalent

### Check E — New endpoint safety
If a new route / controller action is added:
- Does the controller declare an authentication / authorization step? If not → finding (Blocking unless explicitly public)
- Does the response shape have any user PII? If yes → finding (Suggestion: confirm intentional)

## Phase 3 — Render the Report

```
## QA Review — PR #{PR_NUMBER}: {pr title}

### Verdict
{🟢 LGTM (QA) | 🟡 NEEDS DISCUSSION | 🔴 NEEDS CHANGES}
- 🟢 LGTM (QA) — no Blocking findings, ready for QA
- 🟡 NEEDS DISCUSSION — non-blocking suggestions, dev can choose to address or defer
- 🔴 NEEDS CHANGES — Blocking findings present; PR should not be marked Ready for QA until addressed

### Change Type
{bug-fix | feature | refactor | dep-update | infra}

### Files (by layer)
{grouped list}

### Findings
| # | Severity | Category | File:Line | Finding |
|---|----------|----------|-----------|---------|
| 1 | 🔴 Blocking | Untested code path | app/models/user.rb:42 | New `User#suspended?` has no spec. Add a spec covering nil and present `deactivated_at` cases. |
| 2 | 🟡 Suggestion | Missing edge case | app/controllers/users_controller.rb:78 | What happens when user is already suspended? Add a spec for the idempotency case. |
...

### AC Coverage (if applicable)
| AC | Addressed? | File(s) |
|---|---|---|
| AC-1 | ✅ | app/models/user.rb |
| AC-2 | ❌ | not found in diff |
...

### Pre-existing Concerns
- (any findings about untouched code surface — usually empty for a QA review)
```

## Phase 4 — Post Inline Comments (if `POST_COMMENT=true`)

For each finding with a file:line:
```bash
gh api repos/{REPO}/pulls/{PR_NUMBER}/comments -X POST \
  -f body="<finding text with severity prefix>" \
  -f commit_id="$(gh api repos/{REPO}/pulls/{PR_NUMBER} --jq .head.sha)" \
  -f path="<file>" \
  -F line=<line>
```

For findings without a specific file:line (e.g. AC coverage gaps), post as a general PR comment review:
```bash
gh api repos/{REPO}/pulls/{PR_NUMBER}/reviews -X POST \
  -f event="COMMENT" \
  -f body="<aggregated findings markdown>"
```

If any post fails: note in the report and continue.

## Phase 5 — Write Context

Write per **Shared: Session Context** if `TICKET_KEY≠none` — `review` key:
- `pr_number`, `verdict`, `inline_comments_posted` (count, 0 if `POST_COMMENT=false`)
- `findings_summary` — array of plain strings (one per Blocking finding)
- `timestamp`

If `TICKET_KEY=none`: skip context write — review wasn't ticket-scoped.
