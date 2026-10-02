# Build log

What works and what is stubbed after each step. Newest first.

## Phase 1, step 1.1: foundation (shared rules and tooling), complete

Works (70 tests, all passing):
- npm workspaces monorepo, strict TypeScript 6.0.3, ESLint 10, Vitest 5, Zod 4
- `@meridian/shared`:
  - roles and the RBAC policy table, pinned to the documented matrix (12 tests)
  - phone normalisation and identifier masking (14 tests)
  - Lagos (WAT) time helpers (3 tests)
  - fuzzy duplicate scoring (17 tests)
  - station queue rules (11 tests)
  - Zod schemas for login, registration and queue moves (13 tests)

Found and fixed along the way:
- The date-of-birth "not in the future" check compared against the UTC date, which would have rejected a baby born in the first hour after midnight in Lagos. It now uses the Lagos date, with a test.
- npm 11.1.0 crashed installing Vitest. npm 11.21.0 fixes it (see `ASSUMPTIONS.md` J-008).

Stubbed or not started:
- No API, no database code, no web app yet (steps 1.2 to 1.4)
- The rules are not reachable from any screen yet
- Zod 4 with `@hookform/resolvers` is unconfirmed until the web app is built

How to check: `npm install`, then `npm run check` from the project root.
