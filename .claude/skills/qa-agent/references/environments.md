# Shared: Environment Resolution

Resolves `--env local|staging|production` (or auto-detected from a PR base branch) to a base URL + DB query mechanism.

## Step 1 — Resolve Base URL

Look up the env from config in this order:
1. `.claude/skills/qa-agent/config.json` keys: `local_url`, `staging_url`, `production_url`
2. Fallback: `.claude/context/env-urls.md` if present (parse the table for the requested env)
3. Fallback: known defaults — `local` → `http://localhost:3000` / `http://localhost:5173` (try `localhost:3000` first, fall through to `:5173` if connection refused)

Store as `ENV_BASE_URL`. If unresolvable: stop with `⛔ Could not resolve base URL for env={env}. Set {env}_url in /qa-agent config.`

## Step 2 — Resolve DB Query Mechanism

| Env | DB query command | Notes |
|---|---|---|
| `local` | `bin/rails runner "<code>"` | Project-dependent — adapt for non-Rails projects (e.g. `python manage.py shell -c`, raw `psql`) |
| `staging` | `<staging shell> rails runner '<code>'` | Or project's equivalent staging shell |
| `production` | `<production shell> rails runner '<code>'` | **Read-only — never run writes** |

If the project has a `.claude/skills/rails-env/SKILL.md` (or similar), prefer the documented commands there over these defaults.

**Note on `BE_TEST_CMD` (rspec/jest/pytest):** The backend test runner always executes against the **local test database** regardless of `--env`. It is not possible to point rspec at a staging DB. When `ENV=staging`, staging verification relies on browser (playwright-driver) and `DB_QUERY_CMD` only — skip the test-runner bucket or run it as a local unit check that does not imply staging correctness.

## Step 3 — Read-Only Guard for Production

When `--env production` is the target, every DB query string is checked before execution. **The guard is deny-first: a query runs only if it matches a read pattern AND contains no write token.** When in doubt, refuse — a false refusal costs one clarifying message, a false allow costs production data.

**Must begin with a read pattern:**
`SELECT`, `.find`, `.where`, `.count`, `.first`, `.last`, `.pluck`, `.exists?`, `.size`, `.sum`, `.average`, `.maximum`, `.minimum`, `.distinct`, `.order`, `.limit`, `.select`, `.joins`, `.includes`, `puts`

**Must contain none of these write tokens** (substring match, case-insensitive):

| Category | Tokens |
|---|---|
| Persist | `.save`, `.save!`, `.create`, `.create!`, `.update`, `.update!`, `.update_all`, `.update_column`, `.update_columns`, `.update_attribute`, `.insert`, `.insert_all`, `.upsert`, `.upsert_all`, `.import` |
| Destroy | `.destroy`, `.destroy!`, `.destroy_all`, `.destroy_by`, `.delete`, `.delete_all`, `.delete_by` |
| Mutate in place | `.touch`, `.increment!`, `.decrement!`, `.toggle!`, `reset_counters`, `.reload!` |
| Find-or-write | `find_or_create`, `first_or_create`, `find_or_initialize_by` + save, `create_with` |
| Side effects | `.deliver_now`, `.deliver_later`, `.perform_now`, `.perform_later`, `.enqueue`, `Sidekiq::Client` |
| Raw SQL | `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `GRANT`, `REVOKE`, `execute(`, `exec_update`, `exec_delete` |
| Escape hatches | `system(`, `` ` ``, `eval(`, `send(`, `ActiveRecord::Base.connection` |

Any violation aborts the call with:
```
⛔ Production is read-only. Refusing to run a write query: {first 100 chars of query}.
   Matched write token: {token}
```

This applies to both raw SQL and ORM-style invocations. There is no override flag.

**Known limits of substring matching** — state these plainly rather than implying the guard is airtight:
- A query built by string interpolation at runtime cannot be fully inspected up front. Refuse any production query containing `#{` that resolves to a method call.
- Metaprogramming (`send`, `public_send`, `eval`) can reach a write without naming it. Those tokens are denied outright above.
- A read that triggers a write via a callback or lazy-migration is invisible here. For anything non-obvious on production, prefer a `SELECT` through `psql` over a `rails runner` that instantiates models.

Mutations on **staging** are permitted — several verify flows need them (advancing a notification's `send_after`, seeding a record). Print the query and its intent before running one, so the transcript shows what was changed.
