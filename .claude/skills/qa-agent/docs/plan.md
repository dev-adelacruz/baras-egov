# plan

Reads a ticket and produces a written test plan: AC checklist, positive cases, negative cases, edge cases, regression risks, and data dependencies. Posts the plan as a comment on the ticket and saves it to per-ticket context for `verify` to consume later.

## When to use

- A ticket has thin or ambiguous acceptance criteria and you want to firm them up before dev starts
- You want a paper trail of "what QA will check" attached to the ticket
- You're about to write tests upfront (TDD) and want a written plan first

## Usage

```
/qa-agent plan [ticket key or URL]
```

```
/qa-agent plan BRGY-46
/qa-agent plan https://adelacruz.atlassian.net/browse/BRGY-46
/qa-agent plan BRGY-71
```

## What happens, step by step

### 1. Setup
- Reads your project config
- Resolves the configured tracker (Jira or Linear)
- Fetches the ticket (description, AC, priority, comments, attachments)
- Detects your test stack (RSpec / Jest / Vitest / Playwright / Cypress)

### 2. Analysis
- Extracts or refines the AC list from the ticket
- Reads up to 3 likely-affected files (read-only) to ground the plan
- Generates positive, negative, and edge cases for each AC
- Identifies regression risks and data dependencies (seeds, feature flags, integrations)

### 3. Plan rendering
Writes a structured markdown plan with:
- AC checklist (each AC mapped to a test case)
- Positive / negative / edge cases (each with steps, expected outcome, AC mapping)
- Regression risks (files / features that could break as side effects)
- Data dependencies (records, flags, integrations needed)
- Out of scope (what the plan deliberately does not cover)

### 4. Posts to ticket
Posts the plan as a comment on the ticket. If the comment fails, prints the plan inline so you can paste it manually.

### 5. Saves to context
Writes the plan to `.claude/skills/qa-agent/state/context/{TICKET}.json` so a later `verify` run can use the AC checklist directly.

## What you'll see

```
## QA Test Plan — BRGY-46: Add branch manager to property page

### Acceptance Criteria
- [ ] AC-1: User can save a branch as a draft
- [ ] AC-2: Drafts persist after page reload
- [ ] AC-3: Drafts can be promoted to published

### Positive Cases
1. Save draft from clean state — Click "Save draft" with form filled. Expected: toast "Draft saved", draft appears in sidebar. Maps to: AC-1.
...

### Regression Risks
- app/models/property.rb — adding draft_state may affect existing property serialization
- src/components/PropertyForm.tsx — new state may break existing publish flow

### Data Dependencies
- Admin user with role=manager
- Feature flag: branch_manager_v2 enabled
```

## Before / After

| | Run |
|---|---|
| Before | Just need the ticket key |
| After | Posted plan as ticket comment; saved to context; ready for dev to implement |
| Later | `verify` will pick up the AC checklist automatically |
