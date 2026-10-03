import type { Role } from "../roles";

/**
 * One policy table for the whole product (see docs/PHASE0_PLAN.md section 8).
 * Enforced by API middleware, mirrored in the UI, and pinned by tests.
 *
 * Read levels:
 *   none     cannot read
 *   masked   can read, identifiers (phone, member number) are masked
 *   limited  can read a reduced projection only (fields that role needs)
 *   full     can read everything on the resource
 *
 * Actions are things a role may do beyond reading. "write" means create and update.
 */

export const RESOURCES = [
  "demographics",
  "consent",
  "queue",
  "vitals",
  "clinicalNotes",
  "prescriptions",
  "orders",
  "chargeCapture",
  "priceOverride",
  "payments",
  "preauth",
  "claims",
  "stock",
  "appointments",
  "auditLog",
  "dashboard",
] as const;

export type Resource = (typeof RESOURCES)[number];

export type ReadLevel = "none" | "masked" | "limited" | "full";

export const ACTIONS = [
  "write",
  "quick_add", // nurse adds injections/consumables
  "deposit", // front desk takes a deposit only
  "dispense", // pharmacist dispenses
  "record_result", // lab records a result
  "request", // doctor requests a pre-authorization
  "override", // price override (reason required elsewhere)
] as const;

export type Action = (typeof ACTIONS)[number];
export interface Grant {
  read: ReadLevel;
  actions: readonly Action[];
}

const none: Grant = { read: "none", actions: [] };
const r = (read: ReadLevel, actions: readonly Action[] = []): Grant => ({ read, actions });

export const POLICY: Record<Resource, Record<Role, Grant>> = {
  demographics: {
    front_desk: r("full", ["write"]),
    nurse: r("full"),
    doctor: r("full"),
    pharmacist: r("limited"),
    lab: r("limited"),
    billing: r("full"),
    admin: r("masked"),
  },
  consent: {
    front_desk: r("full", ["write"]),
    nurse: none,
    doctor: none,
    pharmacist: none,
    lab: none,
    billing: r("full"),
    admin: r("full", ["write"]),
  },
  queue: {
    front_desk: r("full", ["write"]),
    nurse: r("full", ["write"]),
    doctor: r("full", ["write"]),
    pharmacist: r("full", ["write"]),
    lab: r("full", ["write"]),
    billing: r("full", ["write"]),
    admin: r("full"),
  },
  vitals: {
    front_desk: none,
    nurse: r("full", ["write"]),
    doctor: r("full"),
    pharmacist: none,
    lab: none,
    billing: none,
    admin: none,
  },
  clinicalNotes: {
    front_desk: none,
    nurse: r("full"),
    doctor: r("full", ["write"]),
    pharmacist: r("limited"),
    lab: none,
    billing: r("limited"), // ICD-10 code only, for claims
    admin: none,
  },
  prescriptions: {
    front_desk: none,
    nurse: r("full"),
    doctor: r("full", ["write"]),
    pharmacist: r("full", ["dispense"]),
    lab: none,
    billing: r("limited"),
    admin: none,
  },
  orders: {
    front_desk: none,
    nurse: r("full"),
    doctor: r("full", ["write"]), // doctors place orders and read results
    pharmacist: none,
    lab: r("full", ["record_result"]),
    billing: r("limited"), // order and charge only
    admin: none,
  },
  chargeCapture: {
    front_desk: r("full"),
    nurse: r("limited", ["quick_add"]),
    doctor: r("limited", ["write"]),
    pharmacist: none, // charge is created automatically when a drug is dispensed
    lab: none, // charge is created automatically when a result is recorded
    billing: r("full", ["write"]),
    admin: r("full"),
  },
  priceOverride: {
    front_desk: none,
    nurse: none,
    doctor: none,
    pharmacist: none,
    lab: none,
    billing: r("full", ["override"]),
    admin: r("full", ["override"]),
  },
  payments: {
    front_desk: r("limited", ["deposit"]),
    nurse: none,
    doctor: none,
    pharmacist: none,
    lab: none,
    billing: r("full", ["write"]),
    admin: r("full"),
  },
  preauth: {
    front_desk: r("full", ["write"]),
    nurse: r("full"),
    doctor: r("full", ["request"]),
    pharmacist: none,
    lab: none,
    billing: r("full", ["write"]),
    admin: r("full"),
  },
  claims: {
    front_desk: none,
    nurse: none,
    doctor: none,
    pharmacist: none,
    lab: none,
    billing: r("full", ["write"]),
    admin: r("full"),
  },
  stock: {
    front_desk: none,
    nurse: none,
    doctor: none,
    pharmacist: r("full", ["write"]),
    lab: none,
    billing: none,
    admin: r("full"),
  },
  appointments: {
    front_desk: r("full", ["write"]),
    nurse: r("full"),
    doctor: r("full"),
    pharmacist: none,
    lab: none,
    billing: r("full"),
    admin: r("full"),
  },
  auditLog: {
    front_desk: none,
    nurse: none,
    doctor: none,
    pharmacist: none,
    lab: none,
    billing: none,
    admin: r("full"),
  },
  dashboard: {
    front_desk: none,
    nurse: none,
    doctor: none,
    pharmacist: none,
    lab: none,
    billing: r("limited"), // revenue figures only
    admin: r("full"),
  },
};

export function readLevel(role: Role, resource: Resource): ReadLevel {
  return POLICY[resource][role].read;
}

export function canRead(role: Role, resource: Resource): boolean {
  return readLevel(role, resource) !== "none";
}

export function canDo(role: Role, resource: Resource, action: Action): boolean {
  return POLICY[resource][role].actions.includes(action);
}

/**
 * Break-glass: a doctor or nurse may open a clinical record outside their normal scope
 * only after entering a reason. Front desk can never read clinical notes.
 */
export const BREAK_GLASS_ROLES: readonly Role[] = ["doctor", "nurse"];
export const BREAK_GLASS_MIN_REASON_LENGTH = 10; // illustrative

export function canBreakGlass(role: Role): boolean {
  return BREAK_GLASS_ROLES.includes(role);
}