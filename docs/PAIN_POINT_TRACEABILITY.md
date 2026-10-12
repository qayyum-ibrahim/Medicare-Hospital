# Pain point traceability

Pain point, feature, screen, test. This table grows every step and is finished in Phase 8.
Status key: **rule built** (tested logic, not reachable from the API yet), **API built** (works through the API against a real database, no screen yet), **built** (works end to end with a screen), **not started**.

Last updated: Phase 1, step 1.2 complete.

| Pain point | Feature | Screen | Test | Status |
|---|---|---|---|---|
| P5 duplicate patient files | Fuzzy duplicate scoring (name, date of birth, phone; twins, family phones, newborns handled) | Registration warning | `packages/shared/test/duplicates.test.ts` | rule built |
| P5 duplicate patient files | Phone normalisation to +234 and registration validation (including Lagos-day date of birth) | Registration form | `packages/shared/test/phone.test.ts`, `schemas.test.ts` | rule built |
| P6 invisible queues | Station order, expected moves, priority ordering, wait against target, per-station summary | Live queue board | `packages/shared/test/queue.test.ts` | rule built |
| P10 data protection | Role access policy table (7 roles, 16 resources, 7 actions) | n/a | `packages/shared/test/rbac.test.ts` | rule built |
| P10 data protection | Role guards enforce the policy on every route: 401 without a token, 403 without permission, read level passed on | n/a (server) | `apps/api/test/guards.test.ts` (896 role, resource and action combinations) | API built |
| P10 data protection | `GET /auth/permissions`: what the signed-in role may see and do (for the web menu) | Menu per role | `apps/api/test/permissions.test.ts` | API built |
| P10 data protection | Staff accounts, scrypt password hashing, seven fictional demo logins | Login screen | `apps/api/test/password.test.ts`, `demoUsers.test.ts`, `userModel.test.ts` | API built |
| P10 data protection | Login with identical answers for unknown email, wrong password and switched-off account, decoy hash, sign-in lockout | Login screen | `apps/api/test/authRoutes.test.ts`, `throttle.test.ts`, `throttleLock.test.ts` | API built |
| P10 data protection | Short-lived access token, refresh token in httpOnly cookie, rotation with theft detection, logout, idle and absolute session limits | Login, silent refresh, idle timer | `apps/api/test/tokens.test.ts`, `sessionService.test.ts`, `sessionRevoke.test.ts`, `sessionRoutes.test.ts`, `cookies.test.ts` | API built (idle timer in web pending) |
| P10 data protection | Tamper-evident audit log: keyed hash chain, append-only, admin-only viewer with filters and paging, chain verification | Admin audit screen | `apps/api/test/auditChain.test.ts`, `auditService.test.ts`, `auditRoutes.test.ts` | API built |
| P10 data protection | Security events recorded: sign-in, failed sign-in, lockout, logout, refresh-token reuse, every refused request | Admin audit screen | `apps/api/test/authAudit.test.ts`, `guardsAudit.test.ts` | API built |
| P10 data protection | Masked identifiers | Admin views | `packages/shared/test/phone.test.ts` (masking helpers); read level passed to routes by the guards | rule built (not yet applied to patient data) |
| P10 data protection | Break-glass access with a mandatory reason | Patient chart | policy only (`canBreakGlass` in `rbac.test.ts`) | rule built (endpoint pending) |
| P10 data protection | Versioned consent captured at registration | Registration form | schema field only (`schemas.test.ts`) | rule built (storage pending) |
| P10 data protection | Data-access request log | Admin | | not started |
| Requirements (WAT) | WAT display and Lagos calendar day | All screens | `packages/shared/test/time.test.ts` | rule built |
| P1 revenue leakage | | | | not started |
| P2 HMO pre-authorization | | | | not started |
| P3 HMO claims | | | | not started |
| P4 patient billing | | | | not started |
| P7 no-shows | | | | not started |
| P8 pharmacy | | | | not started |
| P9 offline | | | | not started |
