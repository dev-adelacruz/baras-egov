# Baras eGov — Barangay Console

A staff-facing local-government platform for the **Municipality of Baras**. It
unifies resident records and LGU services (civil registry, treasury, business
permits, social welfare, disaster response, health) behind role-based access
scoped by office and barangay. This repository contains both the API and the
web client.

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Ruby on Rails 7.1 (API), Ruby 3.2.2 |
| Auth | Devise + devise-jwt (JWT in the `Authorization` header) |
| Database | PostgreSQL |
| Serialization | Blueprinter |
| API docs | rswag (Swagger UI at `/api-docs`) |
| Frontend | React 18 + TypeScript, Redux Toolkit, React Router, Tailwind CSS |
| Build | Vite (via `vite-plugin-ruby`) |
| Tests | RSpec (backend), Vitest (frontend) |

The frontend lives under [`app/frontend/`](app/frontend/) and is served by Vite
through Rails in development.

---

## Prerequisites

Install these before setting up the project:

- **Ruby 3.2.2** — the version is pinned in [`.ruby-version`](.ruby-version) and
  [`Gemfile`](Gemfile). A version manager that reads `.ruby-version` is
  recommended:
  ```bash
  # with mise (https://mise.jdx.dev)
  mise use ruby@3.2.2
  # or rbenv
  rbenv install 3.2.2
  ```
- **Bundler** — `gem install bundler`
- **Node.js 18+ and Yarn (Classic, v1)** — Vite 5 requires Node 18 or newer:
  ```bash
  npm install -g yarn
  ```
- **PostgreSQL** — running locally and reachable on the default socket/port.
  ```bash
  # macOS (Homebrew)
  brew install postgresql@16 && brew services start postgresql@16
  ```

---

## Setup

```bash
# 1. Clone
git clone https://github.com/dev-adelacruz/baras-egov.git
cd baras-egov

# 2. Install backend dependencies
bundle install

# 3. Install frontend dependencies
yarn install

# 4. Create and migrate the database (creates dev + test DBs, runs migrations, seeds)
bin/rails db:prepare
```

### Rails credentials (required)

The Devise JWT signing secret is stored in Rails' encrypted credentials
(`config/credentials.yml.enc`) under `devise_jwt_secret_key`, and is decrypted
with `config/master.key`.

- `config/master.key` is **git-ignored** — obtain it from a teammate or your
  secret manager and place it at `config/master.key`. Without it the app cannot
  decrypt the JWT secret and will not boot.
- To inspect or set the key yourself:
  ```bash
  bin/rails credentials:edit
  # ensure this line exists:
  #   devise_jwt_secret_key: <a long random string>
  ```
  Generate a value with `bin/rails secret` if you need a fresh one (this
  invalidates existing tokens).

### Environment variables

All optional — sensible defaults are applied when unset:

| Variable | Default | Purpose |
|---|---|---|
| `JWT_EXPIRATION_MINUTES` | `60` | JWT session lifetime, in minutes |
| `DEVISE_MAX_LOGIN_ATTEMPTS` | `10` | Failed sign-ins before an account locks |
| `DEVISE_UNLOCK_IN_HOURS` | `1` | Auto-unlock interval after a lockout, in hours |
| `RAILS_MAX_THREADS` | `5` | DB connection pool size |

---

## Running the app

Start the Rails server and the Vite dev server together with foreman:

```bash
bin/dev
```

This runs the processes defined in [`Procfile.dev`](Procfile.dev):

- `web` — `bin/rails s -p 3000`
- `vite` — `bin/vite dev`

The app is then available at **http://localhost:3000**, and the API
documentation (Swagger UI) at **http://localhost:3000/api-docs**.

To run the processes individually instead (two terminals):

```bash
bin/rails s -p 3000   # terminal 1
bin/vite dev          # terminal 2
```

### Creating the first user

Sign-up defaults new accounts to the `municipal_staff` role. To create an
initial **admin** (who can then manage other accounts via the app), use the
Rails console:

```bash
bin/rails console
```
```ruby
User.create!(email: "admin@baras.gov", password: "change-me-please", role: :admin)
```

Admins can then provision and manage staff accounts from the **Users** screen
(`/admin/users`).

---

## Testing & quality

```bash
# Backend — RSpec
bundle exec rspec

# Frontend — Vitest
yarn test

# Frontend — TypeScript type check
npx tsc --noEmit
```

> **RuboCop:** the project ships no committed `.rubocop.yml`, so there is no
> enforced lint configuration. Match the style of the surrounding code rather
> than running blanket auto-correct.

---

## Project structure

```
app/
  controllers/api/v1/     # Versioned JSON API (auth, /me, admin/users, …)
  models/                 # ActiveRecord models + Permission policy
  blueprints/             # Blueprinter serializers
  frontend/               # React + TypeScript client
    components/           # Reusable components (auth, Can, ProtectedRoute)
    pages/                # Route-level pages (login, home, admin/users, …)
    hooks/                # usePermissions and other hooks
    services/             # API clients (authService, adminUserService, …)
    state/                # Redux store and slices
config/
  routes/                 # Route definitions (drawn from routes.rb)
db/                       # Migrations, schema, seeds
spec/                     # RSpec tests
docs/                     # Engineering documentation (see below)
```

## Further documentation

Engineering docs live in [`docs/`](docs/):

- [docs/README.md](docs/README.md) — documentation index and conventions
- [docs/identity-access.md](docs/identity-access.md) — authentication, RBAC, and
  account management (roles, permissions, `/api/v1/me`, admin API)
