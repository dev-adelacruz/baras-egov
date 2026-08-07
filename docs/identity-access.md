# Identity, Roles & Access Control

This document describes the foundational Identity & Access epic for the Barangay
Console: staff authentication, role-based access control (RBAC) scoped by office
and barangay, and admin account management. It is the foundation nearly every
other module builds on and the basis for RA 10173 (Data Privacy Act) compliance.

Delivered across six tickets / pull requests:

| Ticket | Scope | PR | Base |
|---|---|---|---|
| BRGY-36 | Staff Authentication — Backend | #1 | `main` |
| BRGY-37 | Staff Authentication — Frontend | #2 | `main` |
| BRGY-38 | Role-Based Access Control — Backend | #3 | `main` |
| BRGY-39 | Role-Based Access Control — Frontend | #4 | `main` |
| BRGY-40 | User Account Management — Backend | #5 | `feat/BRGY-38` (stacked) |
| BRGY-41 | User Account Management — Frontend | #6 | `feat/BRGY-39` (stacked) |

**Suggested merge order:** BRGY-36 → BRGY-38 → BRGY-40, and BRGY-37 → BRGY-39 →
BRGY-41. The two backend/frontend chains are independent; within each chain the
later PRs build on the earlier ones.

---

## 1. Authentication (BRGY-36 / BRGY-37)

Built on the generated Devise + devise-jwt scaffold.

### Backend
- **JWT sessions** — login issues a JWT in the `Authorization` header; logout
  revokes it via the JTI revocation strategy; expiry is configurable
  (`JWT_EXPIRATION_MINUTES`, default 60).
- **Failed-login lockout** — Devise `:lockable` with the `:failed_attempts`
  strategy. Accounts lock after `DEVISE_MAX_LOGIN_ATTEMPTS` (default **10**)
  consecutive failures and auto-unlock after `DEVISE_UNLOCK_IN_HOURS`
  (default **1h**). Columns: `failed_attempts`, `unlock_token`, `locked_at`.
- **Password reset** — `Api::V1::Users::PasswordsController`:
  - `POST /api/v1/users/password` — request reset instructions. Always returns
    200 (enumeration-safe).
  - `PUT /api/v1/users/password` — complete the reset with the emailed token.

### Frontend
- `ForgotPasswordForm` / `ResetPasswordForm` on `/forgot-password` and
  `/reset-password`; the login screen's "Forgot password?" link is wired to
  them, and a success notice is shown after a completed reset.
- `authService.requestPasswordReset` / `resetPassword` consume the endpoints.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/users/sign_in` | Log in (JWT in `Authorization` header) |
| DELETE | `/api/v1/users/sign_out` | Log out (revoke JWT) |
| GET | `/api/v1/users/validate_token` | Validate the current token |
| POST | `/api/v1/users/password` | Request password-reset instructions |
| PUT | `/api/v1/users/password` | Complete a password reset |

---

## 2. Role-Based Access Control (BRGY-38 / BRGY-39)

### Model

`User` carries three access fields:

| Field | Meaning |
|---|---|
| `role` | One of `admin`, `department_head`, `municipal_staff`, `barangay_staff` |
| `office` | The primary module the user works in (e.g. `civil_registry`); `nil` for admins |
| `barangay` | Set for barangay-scoped users; `nil` for municipality-wide users |

### Permission policy

`app/models/permission.rb` is the single source of truth mapping
`role → { module => [actions] }`. Modules align with LGU offices; actions are
`read`, `write`, `delete`, `manage`.

| Role | Access |
|---|---|
| `admin` | Every module, all actions (`read`, `write`, `delete`, `manage`) |
| `department_head` | `manage` on their office module, `read` on all others; never `user_management` |
| `municipal_staff` | `read` + `write` on their office module only |
| `barangay_staff` | `read` + `write` on their office module, **scoped to their barangay** |

Modules: `civil_registry`, `treasury`, `business_permits`, `social_welfare`,
`disaster_management`, `health`, `documents`, `reports`, `user_management`.

### Server-side enforcement

The `Authorizable` concern is the enforcement point (UI hiding is never the
security boundary):

- `authorize_module!(module, action)` — raises → **403 + logs** the denial when
  the current user lacks the permission.
- `apply_data_scope(relation)` — filters a relation to a barangay user's own
  barangay; municipality-wide users are unrestricted.

Authenticated API controllers inherit `Api::V1::BaseController`, which requires
a valid JWT (401 otherwise) and mixes in `Authorizable`.

### The `/api/v1/me` endpoint

`GET /api/v1/me` returns the current user's identity, role, scope and permission
map so the frontend can render role-aware UI:

```json
{
  "status": { "code": 200, "message": "OK" },
  "data": {
    "user": {
      "id": 1, "email": "clerk@baras.gov",
      "role": "barangay_staff",
      "office": "disaster_management",
      "barangay": "Barangay San Isidro",
      "permissions": { "disaster_management": ["read", "write"] },
      "data_scope": { "barangay": "Barangay San Isidro" }
    }
  }
}
```

`data_scope` is `"all"` for municipality-wide users or `{ "barangay": "…" }` for
barangay staff.

### Frontend primitives

- `authService.fetchMe()` + the `fetchCurrentUser` Redux thunk load and store
  role/permissions/scope (after login and on app start).
- `usePermissions()` — `can(module, action)`, `canAccessModule(module)`,
  `accessibleModules`, `role`, `barangay`, `isBarangayScoped`.
- `<Can module="…" action="…">` — conditional rendering by permission.
- The dashboard hides nav items the user can't access and surfaces the user's
  role and (for barangay staff) their barangay scope.

---

## 3. User Account Management (BRGY-40 / BRGY-41)

Admin-only provisioning, editing, and deactivation of staff accounts.

### Backend

`Api::V1::Admin::UsersController`, every action guarded by the
`user_management` module (admins only):

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/admin/users` | List accounts; filter by `office`, `barangay`; search by `email` |
| POST | `/api/v1/admin/users` | Create an account with role/office/barangay |
| PATCH/PUT | `/api/v1/admin/users/:id` | Update role/office/barangay/active |
| PATCH | `/api/v1/admin/users/:id/deactivate` | Deactivate an account |
| PATCH | `/api/v1/admin/users/:id/activate` | Reactivate an account |

**Deactivation** uses an `active` flag; Devise's `active_for_authentication?`
hook blocks deactivated accounts from signing in. Non-admins receive **403**,
unauthenticated requests **401**.

### Frontend

`AdminUsersPage` at `/admin/users` (reached from the dashboard "Users" item):
account table with inline role reassignment, activate/deactivate, office and
barangay filters, email search, and a create-account form. The page is gated by
`usePermissions`; non-admins see an access-restricted view.

---

## 4. Known limitations / follow-ups

- **Barangay data scoping** is implemented and exposed (`apply_data_scope`,
  `usePermissions().dataScope`) but not yet applied to any domain listings —
  no domain models exist yet (resident/registry tickets are downstream).
- **Audit logging** beyond denial logging is out of scope here — see BRGY-42.
- **Email delivery** for password reset needs production SMTP configuration
  (sender domain, host); test/development use in-process delivery.
- The two PR chains touch a few shared files (`User`, `authService`,
  `LoginForm`, `userSlice`); expect trivial merge conflicts resolved in the
  suggested merge order.
