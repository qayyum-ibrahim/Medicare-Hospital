# Build log

What works and what is stubbed after each step. Newest first. Test counts are for the whole repository at the end of that step.

## Phase 1, step 1.2g: the audit log records security events

Works (shared 73 tests, API 170 tests):
- Sign-in, failed sign-in, lockout, logout, replayed refresh token and every refused request (403) are written to the audit log.
- A failed sign-in stores the reason and the account id (if the account exists), never the email or password typed.
- A lockout is logged once when it starts, not for every blocked attempt, so the log cannot be flooded that way.
- If the audit log is unavailable, staff can still sign in and the problem is printed on the server console.
- One audited set of role guards is built in `app.ts` and passed to routers.

Verified live on the developer's Atlas cluster: the event list shows the expected entries, the chain still verifies.

Found along the way:
- One small edit in a list of edits was missed once (`audit` missing from `AuthDeps`). From then on, files with more than one change are given whole.

Not done: unauthenticated requests are not logged as refusals; a signed-in account that keeps probing is not rate limited (see `ASSUMPTIONS.md` I-014).

## Phase 1, step 1.2f: tamper-evident audit log

Works (shared 73, API 151):
- Append-only audit log. Each entry carries a keyed hash (HMAC with `AUDIT_SECRET`) of its contents and of the previous entry.
- `GET /audit-log` (admin only): newest first, filters, paging. `GET /audit-log/verify` walks the chain and names the first broken entry.
- Viewing and verifying are themselves recorded, and reading the log refuses to proceed if its own entry cannot be written.

Verified live: editing one number in Atlas made verification report `firstBadSeq` for that entry; restoring the value made it pass again.

Found along the way: nothing broken in the code. Six deliberate breaks (hash check removed, chain link removed, a field left out of the hash, missing-entry check removed, fail-closed removed, role guard removed) were each caught by the tests.

## Phase 1, step 1.2e: sessions

Works (shared 71, API 115):
- Refresh token in an httpOnly, SameSite=Strict cookie scoped to `/auth`. Only its SHA-256 hash is stored.
- Rotation on every refresh; a replaced token reused after a 10 second grace period revokes the whole session.
- Idle limit 15 minutes, absolute limit 12 hours. Logout revokes the session on the server.
- Role changes and switched-off accounts take effect at the next refresh.
- Required header `X-Meridian-Client: web` on refresh and logout.

Verified live: refresh, rotation, theft detection (the newest cookie died too), logout.

Found along the way: five deliberate breaks (reuse detection, idle limit, raw token storage, httpOnly off, header check) were each caught by the tests.

## Phase 1, step 1.2d: role guards

Works (shared 71, API 75):
- `requireRead(resource)` and `requireAction(resource, action)` guards, single handlers that check sign-in themselves. 401 for no token, 403 for no permission.
- `GET /auth/permissions`.
- The route-matrix test: every role against every resource and action (896 combinations).

Found along the way:
- Returning an array of handlers stopped TypeScript from typing the route handler after it, so guards became single handlers.
- The heavy matrix tests timed out on the developer's slower Mac at the default 5 seconds; they now have 60 second timeouts.

## Phase 1, step 1.2c: login

Works (shared 70, API 67):
- `POST /auth/login`, `GET /auth/me`, 15 minute access tokens (jose, HS256), sign-in lockout (5 failures per address and email in 15 minutes).
- Identical answers for a wrong password, an unknown email and a switched-off account; a decoy hash keeps timing similar.
- The password hash never appears in a response.

Found along the way: nothing broken. The configuration was split into basic, seed and server settings.

## Phase 1, step 1.2b: staff accounts and password hashing

Works (shared 70, API 38):
- User model, scrypt password hashing (self-describing format), seven fictional demo users, `npm run seed` (safe to repeat).

Found along the way:
- Node's default scrypt memory limit rejects N=2^15, so the code sets it explicitly and a test guards it.
- Mongoose 9 deprecated `validateSync`; tests use `validate`.

Verified live: seed created 7 users, a second run updated 7 and created 0.

## Phase 1, step 1.2a: API skeleton and database connection

Works (shared 70, API 15):
- Express 5 server, configuration checking (messages never include secret values), Mongoose connection to Atlas, `GET /health` and `GET /health/db`.

Found along the way:
- A missing `MONGODB_URI` gave a generic message until the schema carried the helpful one.
- npm's `-w` flag silently does nothing on a brand-new workspace until a plain `npm install` has registered it.

## Phase 1, step 1.1: foundation (shared rules and tooling)

Works (70 tests):
- npm workspaces monorepo, strict TypeScript 6.0.3, ESLint 10, Vitest 5, Zod 4.
- `@meridian/shared`: roles and the RBAC policy table, phone normalisation and masking, Lagos (WAT) time helpers, fuzzy duplicate scoring, station queue rules, Zod schemas for login, registration and queue moves.

Found along the way:
- The date-of-birth "not in the future" check used the UTC date, which would have rejected a baby born in the first hour after midnight in Lagos. It now uses the Lagos date, with a test.
- npm 11.1.0 crashes installing Vitest. npm 11.21.0 fixes it (`ASSUMPTIONS.md` J-008).

## Phase 0: plan and setup

Delivered: `PHASE0_PLAN.md`, `ASSUMPTIONS.md`, `DEV_SETUP.md`, `tools/check-mongo`. MongoDB Atlas chosen; the check passed (replica set, transactions commit and roll back).
