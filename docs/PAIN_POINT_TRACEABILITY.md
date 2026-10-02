# Pain point traceability

Pain point, feature, screen, test. This table grows every phase and is finished in Phase 8.
Status key: **rule built** (tested logic, not yet reachable from a screen), **built** (works end to end), **not started**.

Last updated: Phase 1, step 1.1 complete.

| Pain point | Feature | Screen | Test | Status |
|---|---|---|---|---|
| P5 duplicate patient files | Fuzzy duplicate scoring (name, date of birth, phone; twins, family phones, newborns handled) | Registration warning (step 1.4) | `packages/shared/test/duplicates.test.ts` | rule built |
| P5 duplicate patient files | Phone normalisation to +234 and registration validation (including Lagos-day date of birth) | Registration form (step 1.4) | `packages/shared/test/phone.test.ts`, `schemas.test.ts` | rule built |
| P6 invisible queues | Station order, expected moves, priority ordering, wait against target, per-station summary | Live queue board (step 1.4) | `packages/shared/test/queue.test.ts` | rule built |
| P10 data protection | Role access policy table (7 roles, 16 resources), break-glass roles | Enforced by the API in step 1.2 | `packages/shared/test/rbac.test.ts` | rule built |
| P10 data protection | Masked identifiers (phone) | Admin views (step 1.4) | `packages/shared/test/phone.test.ts` | rule built |
| Requirements (WAT) | WAT display and Lagos calendar day | All screens | `packages/shared/test/time.test.ts` | rule built |
| P1 revenue leakage | | | | not started |
| P2 HMO pre-authorization | | | | not started |
| P3 HMO claims | | | | not started |
| P4 patient billing | | | | not started |
| P7 no-shows | | | | not started |
| P8 pharmacy | | | | not started |
| P9 offline | | | | not started |
