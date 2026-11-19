# Security model

## Authentication
- Email + password (bcrypt, cost 12). Session = HS256 JWT (`jose`) in an **HttpOnly, SameSite=Lax** cookie (`Secure` in production), 12 h TTL, signed with `AUTH_SECRET` (≥ 32 chars, required).
- Every request re-validates the user in the DB: active, not deleted, same company, and `sessionVersion` matches → role changes, deactivation and password resets revoke sessions immediately.
- Login rate limit: 8 attempts / 10 min per IP+email; failed logins audited.
- Demo accounts can log in only when `ENABLE_DEMO_LOGIN=true` **and** the process is not a production build (a production server additionally needs `ALLOW_DEMO_LOGIN_IN_PRODUCTION=true`, intended only for a clearly labelled internal demo server). The demo password is rendered from the server only when demo login is enabled; it is not compiled into the client bundle.
- The seed refuses to run in production (`ALLOW_DEMO_SEED`) and refuses to wipe a database that contains non-demo user accounts (`SEED_FORCE_RESET`).
- Login: bcrypt always runs (no account-existence timing signal), rate limited per IP+account and per account, failed logins audited; the post-login `next` parameter accepts same-origin relative paths only.
- CSV exports neutralise spreadsheet formula injection.

## Authorisation
- Role → permission matrix (`src/lib/permissions.ts`), stored in `Role/Permission/RolePermission` and loaded with the session.
- **All checks are server-side**: actions call `requireUser()` + `assertCan()`; pages call `requirePermission()` (→ `/forbidden`); route handlers return 401/403/404.
- Department-scoped technical approval: a manager may approve only their department's submissions (`canReviewDepartment`). Approval decisions require the approval's `requiredRole` (or Super Admin).
- Integrated plan approval (PM) is blocked while technical approvals are outstanding; open errors require explicit acknowledgement recorded in the decision note.
- Standards (rates, capacities, waste) change only via Super Admin approval of a versioned proposal.

## Tenant isolation
Every query is scoped by `companyId`; department members/viewers are further restricted to their projects/departments (`projectScope`). Integration test `tenant isolation` verifies a foreign-company user sees nothing.

## Input & file security
- zod validation for all action inputs; Prisma parameterised queries; internal DB errors are not echoed to users.
- Uploads: extension allow-list, declared type check, **magic-byte validation**, size limit (`MAX_UPLOAD_MB`, default 20), SHA-256 hash, random storage keys, path-traversal guard, private storage; downloads only through an authorised route with `nosniff`, restrictive CSP and inline only for PDF/images.
- CSV exports neutralise formula injection.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; `poweredByHeader` off.
- Rate limits: login, uploads (30/10 min), AI assistant (40/10 min). In-memory per process — use a shared store when scaling horizontally.

## Audit
`AuditLog` records logins (incl. failures), project creation/status, department assignment, submissions & reviews, plan generation/approval, changes, schedule edits, procurement steps, uploads, extraction reviews, exports, risks, users, standards, AI queries — with user, project, entity, details and IP. Exportable as CSV (`audit.read`).

## Secrets
Only via environment variables (`.env` is git-ignored; `.env.example` documents keys). No credentials in the repository.
