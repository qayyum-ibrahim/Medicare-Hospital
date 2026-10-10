import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, AUDIT_OUTCOMES } from "../src/index";

describe("audit constants", () => {
  it("has no duplicate actions and every name follows area.event", () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    for (const action of AUDIT_ACTIONS) expect(action, action).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it("has the three outcomes", () => {
    expect([...AUDIT_OUTCOMES]).toEqual(["success", "failure", "denied"]);
  });
});