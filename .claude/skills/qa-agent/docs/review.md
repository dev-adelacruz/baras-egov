# review

PR-time QA-lens review. Reads the diff and looks for things devs systematically miss: untested code paths, missing AC coverage, missing edge cases, regression risk, observability gaps, and missing analytics events. Without `--comment`, prints the findings to chat (read-only). With `--comment`, posts each finding as an inline GitHub comment on the relevant line.

## When to use

- You want to apply a QA lens to a PR before it's marked Ready for QA
- "What could break here?" vibe-check on a hot PR
- Your team's bugs are slipping past code review and you want a gate before merge

This is the only qa-agent mode that runs *before* Ready for QA. Skip it entirely if your team only engages QA after dev signs off.

## Usage

```
/qa-agent review [PR link or number]
/qa-agent review [PR link or number] --comment   ← post inline GitHub comments
```

```
/qa-agent review 519
/qa-agent review https://github.com/your-org/your-repo/pull/519 --comment
/qa-agent review 524 --comment
```

## What it looks for

| Category | Example finding |
|---|---|
| Untested code paths | "New `User#suspended?` has no spec. Add a spec covering nil and present `deactivated_at`." |
| Missing AC coverage | "AC-2 'Drafts persist after reload' has no apparent backing change in the diff." |
| Missing edge cases | "What happens when user is already suspended? Add an idempotency spec." |
| Regression risk | "Modified shared `UserSerializer` — 4 callers exist; verify each unchanged behavior." |
| Observability gaps | "New error path raises `PaymentFailed` but no Sentry capture or logger call." |
| Analytics gaps | "New 'Save draft' button has no analytics event despite app-wide convention." |
| BE/FE contract gaps | "API response shape changed (`status` → `state`) but TS interface and consuming hook unchanged." |
| Migration / data risk | "Adds NOT NULL without backfill data step." |
| Auth / permission risk | "New `POST /api/properties` endpoint has no `before_action :authenticate`." |
| Test quality | "Spec mocks `User#suspended?` — the thing under test isn't actually exercised." |

## What happens, step by step

### 1. Setup
- Reads config, resolves tracker
- Fetches PR title, body, diff, changed file list
- Detects associated ticket from PR title/body (if exactly one match)
- Loads the ticket's QA plan from context (if `plan` ran for it earlier)

### 2. Analyze the diff
Groups changed files by layer (controllers / models / services / serializers / migrations / FE components / FE state / tests / configs). Reads each file's diff and notes behavior-changing lines.

### 3. Run targeted checks
- **Test file coverage** — each non-test source file should have a corresponding test file in the PR
- **AC coverage matrix** — each AC from the linked ticket should be addressed by some change in the diff
- **Convention sampling** — compare to nearby existing files; flag new patterns introduced without precedent
- **Migration safety** — NOT NULL without backfill, dropped column with consumers, large-table indexes without `concurrently`
- **New endpoint safety** — auth / authz check present, response PII intentional

### 4. Render verdict + findings
- 🟢 LGTM (QA) — no Blocking findings, ready for QA
- 🟡 NEEDS DISCUSSION — non-blocking suggestions only
- 🔴 NEEDS CHANGES — Blocking findings present

Each finding gets:
- Severity (🔴 Blocking / 🟡 Suggestion / 🟢 Nit)
- Category
- File:line (when possible)
- One-line "what to do"

### 5. Post inline comments (if `--comment`)
For findings with a file:line: posts inline on the PR via `gh api .../comments`. For findings without (e.g. AC coverage gaps): aggregates into a single COMMENT review.

## What you'll see

```
## QA Review — PR #519: Add branch manager to property page

### Verdict
🔴 NEEDS CHANGES — 2 Blocking, 3 Suggestions

### Change Type
feature

### Findings
| # | Severity | Category | File:Line | Finding |
|---|---|---|---|---|
| 1 | 🔴 | Untested code path | app/models/property.rb:88 | New `Property#draft_state` has no spec. Add a spec covering nil and present states. |
| 2 | 🔴 | Missing AC coverage | — | AC-2 ('Drafts persist after reload') not addressed by PR diff. |
| 3 | 🟡 | Missing edge case | app/controllers/properties_controller.rb:42 | What happens if draft is saved twice in quick succession? Add an idempotency spec. |
| 4 | 🟡 | Observability gap | app/services/draft_service.rb:21 | New `raise DraftError` has no logger call or Sentry capture. |
| 5 | 🟢 | Convention | src/components/PropertyForm.tsx:104 | Uses `useState` for draft tracking; nearby form components use the form library's built-in dirty tracking. |

### AC Coverage
| AC | Addressed? | File(s) |
|---|---|---|
| AC-1 | ✅ | app/models/property.rb |
| AC-2 | ❌ | not found in diff |
| AC-3 | ✅ | app/controllers/properties_controller.rb |
```

## Guardrails

- **One finding = one specific concern** — never "Add tests" without saying which one
- **Stays in the diff** — doesn't surface findings about untouched code (that's `dev-agent audit`'s job)
- **Read-only by default** — only posts to GitHub when you pass `--comment`
- **No tracker, no AC matrix** — if no ticket is linked to the PR, the AC coverage check is skipped

## Before / After

| | Run |
|---|---|
| Before | A PR number or URL |
| After: 🟢 LGTM (QA) | Dev can mark Ready for QA |
| After: 🟡 / 🔴 | Findings printed (and optionally posted as inline GitHub comments) |
