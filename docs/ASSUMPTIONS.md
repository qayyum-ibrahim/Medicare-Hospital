# Assumptions and unknowns

Every assumption and unknown in this prototype is recorded here. Anything that looks like a rule, tariff, number or regulation is an **assumption or an illustrative default**, not a fact. Where a value is a setting in the app, it is shown with a "verify" note next to it.

Status key: **Assumed** (my choice, change it if you disagree) / **Illustrative** (a demo number, not a benchmark) / **Verify** (must be checked with the named party before any real use) / **From brief** (you specified it).

Last updated: Phase 0.

---

## A. Scope and hospital profile

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| A-001 | Meridian Care Hospital is fictional: Lagos, about 60 beds, OPD + inpatient + pharmacy + lab. | From brief | n/a |
| A-002 | The patient mix (HMO, corporate, self-pay) is an assumption, not a fact. | From brief | Hospital |
| A-003 | The product is a revenue-cycle and patient-flow system, not a general HMS. Features that do not trace to P1-P10 are not built. | From brief | n/a |
| A-004 | Radiology is represented as imaging orders and results with a price item. No image storage or viewer. | Assumed | Hospital |
| A-005 | Write-off of unrecoverable claims is not built (not in the brief). | Assumed | Hospital finance |

## B. Money, pricing and billing

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| B-001 | The price list is illustrative and clearly labelled "illustrative, not real tariffs". | From brief | Hospital |
| B-002 | All money is stored as integer kobo and shown as naira (₦). | Assumed | n/a |
| B-003 | One active, versioned price list at a time. Price overrides need a role (billing or admin) and a written reason. | From brief | Hospital |
| B-004 | Bed-days are auto-posted once per night. Default cut-off is midnight WAT, as a setting. | Assumed | Hospital |
| B-005 | Final-bill variance against the estimate is flagged when it exceeds 10 percent. The threshold is a setting. | Illustrative | Hospital |
| B-006 | Front desk can take deposits. Billing/finance handles all other payments. | Assumed | Hospital |
| B-007 | Paystack runs in **test mode only**. No live keys are used or stored. | From brief | Paystack docs |
| B-008 | Every payment must carry a narration stating what it was for. | From brief | n/a |
| B-009 | Refunds are recorded as new records linked to the original payment. Payments are never edited or deleted. | Assumed | Hospital finance |
| B-010 | Payment plans are simple schedules (instalment dates and amounts). No interest or fees are calculated. | Assumed | Hospital finance |

## C. HMO, pre-authorization and claims

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| C-001 | The 8 HMOs and 1 corporate scheme are invented. No real names or logos. | From brief | n/a |
| C-002 | Eligibility checks are **Simulated**. No real HMO or NHIA API is used or invented. | From brief | n/a |
| C-003 | Services that likely need pre-auth by default: elective surgery, specialist referral, CT/MRI, admission. Configurable per plan. | From brief | Each HMO agreement |
| C-004 | Pre-auth response SLA defaults to 24 hours. This number is illustrative. | Illustrative | Each HMO agreement |
| C-005 | Pre-auth wait time uses two clocks: HMO-side while REQUESTED, hospital-side while DRAFT or QUERIED. Breach alerts use the HMO-side clock. | Assumed | Hospital |
| C-006 | Pre-auth EXPIRED means an approved authorization passed its valid-until date. | Assumed | Each HMO agreement |
| C-007 | A REJECTED pre-auth can be re-opened as a new DRAFT (appeal) with history kept. | Assumed | Hospital |
| C-008 | Claim payment SLA defaults to 60 days, as a setting labelled "verify current rule". | From brief | **Verify** current regulator and contract terms |
| C-009 | I have not confirmed what any current regulation says about payment timelines. The 60-day figure comes from the brief. | Verify | Regulator, HMO contracts |
| C-010 | Claim states follow the brief, plus one addition: REJECTED can go to RESUBMITTED after correction, needed for demo story 3. | Assumed | Hospital finance |
| C-011 | Claim rejection reason codes are a hospital-defined set. They are not an official HMO or NHIA code set. | Illustrative | Each HMO |
| C-012 | Claims are assembled per HMO per period. The period length is a setting (default: calendar month). | Assumed | Each HMO agreement |
| C-013 | Claim batch export is PDF and CSV. Submission is simulated, no electronic submission format is claimed. | From brief | Each HMO |
| C-014 | Agreed tariffs per HMO are illustrative numbers derived from the illustrative price list. | Illustrative | Each HMO agreement |

## D. Clinical data and records

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| D-001 | The EMR is deliberately light: vitals, complaint, ICD-10 diagnosis, prescriptions, orders, results. | From brief | n/a |
| D-002 | The ICD-10 list is a small subset for demo use. Codes will be checked against the WHO ICD-10 classification before Phase 1 ships. | Verify | WHO ICD-10 |
| D-003 | Data is stored as structured, coded fields so it can be mapped to FHIR later. FHIR is not built. | From brief | n/a |
| D-004 | Duplicate detection uses name + date of birth + phone with fuzzy matching. Score thresholds are illustrative and tunable. | Assumed | Hospital |
| D-005 | Family members can share a phone number. A shared phone raises a match hint but is never enough on its own to flag a duplicate. | Assumed | Hospital |
| D-006 | A newborn is a separate patient record linked to the mother by `motherId`. | Assumed | Hospital |
| D-007 | Email is optional. | From brief | n/a |
| D-008 | Phone numbers are stored in E.164 (+234...) and displayed in local format. | Assumed | n/a |

## E. Queue and flow

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| E-001 | Station order: registration, triage, consult, lab, pharmacy, billing. Not every visit uses every station. | From brief | Hospital |
| E-002 | Illustrative wait targets in minutes: registration 10, triage 15, consult 30, lab 30, pharmacy 15, billing 10. These are demo numbers, not benchmarks. | Illustrative | Hospital |
| E-003 | Triage priority has three levels: urgent, standard, routine. | Assumed | Hospital |

## F. Appointments and messaging

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| F-001 | WhatsApp is **Simulated**. Nothing is sent. The UI shows a preview timeline only. | From brief | n/a |
| F-002 | Reminder timeline: confirmation on booking, interactive confirm/reschedule at 24 hours, day-of reminder, missed-appointment follow-up. | From brief | n/a |
| F-003 | WhatsApp opt-in is a checkbox at booking and is stored with the consent record. | From brief | Legal counsel |
| F-004 | Appointment deposit is optional and uses Paystack test mode. | From brief | n/a |

## G. Pharmacy

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| G-001 | Dispensing follows FEFO (first expiry, first out) by batch. | From brief | Hospital pharmacy |
| G-002 | Near-expiry threshold defaults to 90 days, as a setting. | Illustrative | Hospital pharmacy |
| G-003 | Reorder points are per drug and are illustrative in the seed data. | Illustrative | Hospital pharmacy |
| G-004 | Dispensing requires an open encounter and is **online only** (stock accuracy). | Assumed | Hospital pharmacy |
| G-005 | Generic-name substitution suggestions are based on the generic name field in the seed drug list. They are suggestions for a pharmacist to review, not clinical advice. | Assumed | Pharmacist |
| G-006 | The drug list is a small fictional formulary for demo purposes. | Illustrative | Pharmacist |

## H. Offline and connectivity

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| H-001 | Offline scope: registration, triage vitals, charge capture, queue updates. | From brief | n/a |
| H-002 | Conflict rules are as documented in `PHASE0_PLAN.md` section 9. | Assumed | Hospital |
| H-003 | Offline data on shared devices needs encryption at rest and session timeouts for real use. The prototype does not claim to meet this. | Verify | Security review |
| H-004 | Low-bandwidth mode reduces requests and payload size. It does not guarantee any specific data usage. | Assumed | n/a |

## I. Data protection and security

| ID | Assumption | Status | Verify with |
|---|---|---|---|
| I-001 | The app is designed around the Nigeria Data Protection Act 2023. Building these controls does **not** make the prototype legally compliant. | Verify | Legal counsel |
| I-002 | The breach-response checklist and DPIA draft template (Phase 8) are templates marked "verify with legal counsel". I will not state legal deadlines or duties as fact. | Verify | Legal counsel |
| I-003 | The audit log is hash-chained, which makes tampering detectable. It is not true write-once storage. | Assumed | Security review |
| I-004 | Break-glass access is limited to doctor and nurse and needs a written reason. | Assumed | Hospital |
| I-005 | Session idle timeout defaults to 15 minutes, as a setting. | Illustrative | Hospital |
| I-006 | Identifiers (phone, member number, MRN) are masked by default for roles that do not need them in full. | From brief | Hospital |
| I-007 | Consent text is versioned. The consent wording is placeholder text, not legal text. | Verify | Legal counsel |
| I-008 | A persistent "Demo: fictional data only" banner is always visible. No real patient data is ever used. | From brief | n/a |

## J. Technology decisions

| ID | Decision | Status |
|---|---|---|
| J-001 | npm workspaces monorepo with a shared package for pure business rules. | Assumed |
| J-002 | TypeScript pinned to 6.0.3 because typescript-eslint 8.71.0 declares support only below 6.1.0. Revisit when tooling catches up. | Assumed |
| J-003 | MongoDB must run as a replica set (needed for multi-document transactions), including in local development. | Assumed |
| J-004 | Repository ports and adapters, with an in-memory adapter for tests. | Assumed |
| J-005 | Package versions were read from the npm registry on 30 Sep 2026 and are exact-pinned. | Assumed |
| J-006 | Zod 4 with `@hookform/resolvers` 5.9.1 and ESLint 10 with typescript-eslint are **unconfirmed pairings** until installed and type-checked. | Verify |
| J-007 | Pharmacy, claims and Paystack flows are online only. | Assumed |

## K. Design

| ID | Decision | Status |
|---|---|---|
| K-001 | Palette and type as in `PHASE0_PLAN.md` section 11. Contrast ratios were computed, all text pairs pass WCAG AA (4.5:1). | Assumed |
| K-002 | Font coverage of the naira sign (U+20A6) and tabular figures is **not yet verified**. | Verify |
| K-003 | Status is never conveyed by colour alone. | Assumed |

---

## Open unknowns (I cannot resolve these from here)

1. How a real Lagos private hospital actually lays out its bed-day charging rules (per night, per 24 hours from admission, or per calendar day).
2. Real pre-auth turnaround times for any specific HMO.
3. The current rules, if any, on HMO claim payment timelines.
4. The exact data-protection duties and deadlines that apply to a hospital under current Nigerian law.
5. Whether real HMOs accept claim batches as PDF, CSV, portal upload or something else.

Items 2 to 5 are why the app treats them as configurable settings with a "verify" note and does not present them as facts.
