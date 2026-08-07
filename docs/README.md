# Baras eGov — Documentation

Engineering documentation for the Barangay Console (BRGY) platform — a
staff-facing local-government system for the Municipality of Baras.

## Index

| Document | Description |
|---|---|
| [identity-access.md](identity-access.md) | Identity, Roles & Access Control epic — staff authentication, RBAC, and account management (BRGY-36 → BRGY-41) |

## Conventions

- **Backend** — Rails 7.1 API (`app/controllers/api/v1/...`), Devise + devise-jwt
  auth, Blueprinter serializers, RSpec. Toolchain: Ruby 3.2.2 via `mise`.
- **Frontend** — React 18 + TypeScript + Redux Toolkit + React Router, Vite,
  Vitest. Lives under `app/frontend/`.
- **Auth transport** — JWT issued in the `Authorization` response header on
  login; sent as `Bearer <token>` on subsequent requests.
