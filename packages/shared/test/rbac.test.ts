import { describe, expect, it } from "vitest";
import {
  BREAK_GLASS_ROLES,
  POLICY,
  RESOURCES,
  ROLES,
  canBreakGlass,
  canDo,
  canRead,
  readLevel,
  type Grant,
  type Resource,
  type Role,
} from "../src/index";

function code(g: Grant): string {
  const read = { none: "-", masked: "Rm", limited: "R*", full: "R" }[g.read];
  const actions = g.actions.map((a) => (a === "write" ? "W" : `+${a}`)).join("");
  return read === "-" ? "-" : `${read}${actions}`;
}

// Column order: front_desk, nurse, doctor, pharmacist, lab, billing, admin
// This is the table in docs/PHASE0_PLAN.md section 8. If you change POLICY, change both.
const EXPECTED: Record<Resource, string[]> = {
  demographics: ["RW", "R", "R", "R*", "R*", "R", "Rm"],
  consent: ["RW", "-", "-", "-", "-", "R", "RW"],
  queue: ["RW", "RW", "RW", "RW", "RW", "RW", "R"],
  vitals: ["-", "RW", "R", "-", "-", "-", "-"],
  clinicalNotes: ["-", "R", "RW", "R*", "-", "R*", "-"],
  prescriptions: ["-", "R", "RW", "R+dispense", "-", "R*", "-"],
  orders: ["-", "R", "RW", "-", "R+record_result", "R*", "-"],
  chargeCapture: ["R", "R*+quick_add", "R*W", "-", "-", "RW", "R"],
  priceOverride: ["-", "-", "-", "-", "-", "R+override", "R+override"],
  payments: ["R*+deposit", "-", "-", "-", "-", "RW", "R"],
  preauth: ["RW", "R", "R+request", "-", "-", "RW", "R"],
  claims: ["-", "-", "-", "-", "-", "RW", "R"],
  stock: ["-", "-", "-", "RW", "-", "-", "R"],
  appointments: ["RW", "R", "R", "-", "-", "R", "R"],
  auditLog: ["-", "-", "-", "-", "-", "-", "R"],
  dashboard: ["-", "-", "-", "-", "-", "R*", "R"],
};

describe("RBAC policy table", () => {
  it("defines a grant for every role on every resource", () => {
    for (const resource of RESOURCES) {
      for (const role of ROLES) {
        expect(POLICY[resource][role], `${resource} / ${role}`).toBeDefined();
      }
    }
  });

  it("matches the documented matrix exactly", () => {
    for (const resource of RESOURCES) {
      const actual = ROLES.map((role) => code(POLICY[resource][role]));
      expect(actual, resource).toEqual(EXPECTED[resource]);
    }
  });

  it("never lets front desk read clinical data", () => {
    for (const resource of ["vitals", "clinicalNotes", "prescriptions", "orders"] as const) {
      expect(canRead("front_desk", resource), resource).toBe(false);
    }
  });

  it("keeps clinical data away from admin/owner (aggregate dashboards only)", () => {
    for (const resource of ["vitals", "clinicalNotes", "prescriptions", "orders"] as const) {
      expect(canRead("admin", resource), resource).toBe(false);
    }
  });

  it("lets only admin read the audit log", () => {
    const readers = ROLES.filter((role) => canRead(role, "auditLog"));
    expect(readers).toEqual(["admin"]);
  });

  it("masks demographics identifiers for admin", () => {
    expect(readLevel("admin", "demographics")).toBe("masked");
  });

  it("limits claims writing to billing", () => {
    const writers = ROLES.filter((role) => canDo(role, "claims", "write"));
    expect(writers).toEqual(["billing"]);
  });

  it("limits dispensing to the pharmacist and result entry to the lab", () => {
    expect(ROLES.filter((role) => canDo(role, "prescriptions", "dispense"))).toEqual(["pharmacist"]);
    expect(ROLES.filter((role) => canDo(role, "orders", "record_result"))).toEqual(["lab"]);
  });

  it("limits price overrides to billing and admin", () => {
    expect(ROLES.filter((role) => canDo(role, "priceOverride", "override"))).toEqual(["billing", "admin"]);
  });

  it("does not let a role that can only quick-add do a full write", () => {
    expect(canDo("nurse", "chargeCapture", "quick_add")).toBe(true);
    expect(canDo("nurse", "chargeCapture", "write")).toBe(false);
  });

  it("limits front desk payments to deposits", () => {
    expect(canDo("front_desk", "payments", "deposit")).toBe(true);
    expect(canDo("front_desk", "payments", "write")).toBe(false);
  });

  it("allows break-glass for doctor and nurse only", () => {
    expect([...BREAK_GLASS_ROLES].sort()).toEqual(["doctor", "nurse"]);
    const allowed = ROLES.filter((role: Role) => canBreakGlass(role));
    expect([...allowed].sort()).toEqual(["doctor", "nurse"]);
  });
});