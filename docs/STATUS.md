# Project status

The single page that says where the project stands. Updated at the end of every step. If you start a new conversation with the assistant, paste this file and `BUILD_LOG.md` first.

**Last updated:** after Phase 1, step 1.2g (the API security foundation is complete).

## Where we stopped

- Phase 0 (plan): done.
- Phase 1 (auth, roles, audit, registration, duplicates, queue):
  - 1.1 shared rules and schemas: done.
  - 1.2 API security foundation (accounts, login, sessions, role guards, audit log, audited security events): done.
  - **Next: 1.3a patients and registration API.**

Everything below was run and confirmed on the developer's Mac against a real MongoDB Atlas cluster, unless marked otherwise.

## What exists

Test totals at this point: shared package 73 tests in 7 files, API 170 tests in 25 files. `npm run check` runs lint, type-check and all tests.

### API endpoints

| Method and path | Who | Purpose |
|---|---|---|
| GET `/health`, `/health/db` | anyone | liveness and database check |
| POST `/auth/login` | anyone | sign in, sets the refresh cookie |
| POST `/auth/refresh` | cookie plus `X-Meridian-Client: web` | new access token, rotates the cookie |
| POST `/auth/logout` | cookie plus `X-Meridian-Client: web` | ends the session on the server |
| GET `/auth/me` | signed in | who am I |
| GET `/auth/permissions` | signed in | what this role may see and do |
| GET `/audit-log`, `/audit-log/verify` | admin | view and verify the audit log |

### Database collections (in the `meridian` database)

`users`, `sessions`, `auditentries`.

### Demo accounts (fictional staff)

All seven share the password in `DEMO_PASSWORD` in the private `apps/api/.env`.

| Role | Email |
|---|---|
| front_desk | frontdesk@meridian.example |
| nurse | nurse@meridian.example |
| doctor | doctor@meridian.example |
| pharmacist | pharmacist@meridian.example |
| lab | lab@meridian.example |
| billing | billing@meridian.example |
| admin | admin@meridian.example |

### Code layout

```
packages/shared/src       roles, time, audit constants, rules/ (rbac, phone, masking, duplicates, queue), schemas/ (auth, patient, queue)
apps/api/src
  app.ts server.ts config.ts db.ts
  auth/       password, tokens, throttle, middleware, guards, permissions, sessions, cookies, routes
  users/      types, userModel, mongoUserRepo, memoryUserRepo
  sessions/   types, sessionModel, mongoSessionRepo, memorySessionRepo
  audit/      types, chain, service, auditModel, mongoAuditRepo, memoryAuditRepo, routes
  seed/       demoUsers, run
apps/api/test, packages/shared/test    tests (in-memory adapters; Mongo adapters are verified by live runs)
tools/check-mongo                      Phase 0 database check
docs/                                  this folder
```

### Settings (`apps/api/.env`, never committed)

| Name | Required | Meaning |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string, with `/meridian` after the host |
| `JWT_ACCESS_SECRET` | yes (server) | signs access tokens, at least 32 characters |
| `AUDIT_SECRET` | yes (server) | signs the audit chain, at least 32 characters, keep a safe copy |
| `DEMO_PASSWORD` | yes (seed) | shared password for the demo accounts, at least 10 characters |
| `PORT` | no | default 4000 |
| `ACCESS_TOKEN_MINUTES` | no | default 15 |
| `SESSION_IDLE_MINUTES` | no | default 15 |
| `SESSION_ABSOLUTE_HOURS` | no | default 12 |
| `NODE_ENV` | no | `production` makes the cookie Secure |

### Daily commands (from the project root)

| Command | What it does |
|---|---|
| `npm run check` | lint, type-check, all tests |
| `npm run seed` | create or refresh the seven demo accounts |
| `npm run dev -w @meridian/api` | start the API with auto-restart (restart it by hand after changing `.env`) |

### Pinned versions

Node 22 or newer (developer has v22.14.0), npm 11.21.0, TypeScript 6.0.3, Vitest 5.0.2, ESLint 10.11.0, typescript-eslint 8.71.0, Zod 4.6.5, Express 5.2.1, Mongoose 9.10.3, jose 6.2.12, tsx 4.23.15, supertest 7.3.0.

## Roadmap (my plan, may change as we learn)

Rest of Phase 1:

1. **1.3a** Patients and registration API: patient and consent storage, `POST /patients` with the duplicate check and the "different person" confirmation, patient search, masked reads by role, audit entries (patient create, view, search, duplicate override).
2. **1.3b** Queue API: encounters and queue events, register-and-queue in one call, move endpoint (reason required for unexpected moves), live board summary.
3. **1.4a** Web foundation: Vite, React and Tailwind scaffold, brand shell, CORS for the cookie, login screen with silent refresh and the idle timer, role-based menu from `/auth/permissions`.
4. **1.4b** Web screens: register-and-queue with the duplicate warning, live queue board, admin audit viewer.

Then Phase 2 (price list, charge capture, bills, payments, receipts) and the rest as in `PHASE0_PLAN.md` section 12. Break-glass access and the data-access request log are needed for P10 and will be built once clinical data exists.

## Open items

- Optional, not yet done: look at the `sessions` collection in Atlas; test the idle timeout live with `SESSION_IDLE_MINUTES=1`.
- Zod 4 with `@hookform/resolvers` is unconfirmed until the web app is built.
- The naira sign (U+20A6) and tabular figures in the chosen font are unverified until the web app is built.
- ICD-10 codes must be checked against the WHO classification before first use (Phase 3).
- Phone validation, password cost and similar values are marked "verify" in `ASSUMPTIONS.md`.
- The developer's project folder is named `medicare`; docs say `meridian-care`.

## How we work

- One feature per step. Each step: the assistant writes the code in the chat, the developer pastes it, runs `npm run check`, runs a live check against Atlas, reports the results, and commits.
- Files with more than one change are given whole, to avoid missed edits.
- Secrets never go in chat or in git. Only outputs that contain no secrets are pasted back.
- Every step ends with a docs update: this file, `BUILD_LOG.md`, `ASSUMPTIONS.md` and `PAIN_POINT_TRACEABILITY.md`.
- Anything that is an assumption, a number from memory or a rule I could not check is recorded in `ASSUMPTIONS.md` with who should verify it.
- All data is fictional. No real patient data is ever used.
