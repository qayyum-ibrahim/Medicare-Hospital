import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../src/config";

const base = {
  MONGODB_URI: "mongodb+srv://bob:hunter2@cluster0.example.mongodb.net/meridian",
  JWT_ACCESS_SECRET: "x".repeat(40),
  AUDIT_SECRET: "y".repeat(40),
};

describe("AUDIT_SECRET", () => {
  it("is accepted when long enough", () => {
    expect(loadServerConfig(base).AUDIT_SECRET).toBe("y".repeat(40));
  });

  it("tells you how to generate one when it is missing", () => {
    const { AUDIT_SECRET: _omit, ...without } = base;
    expect(() => loadServerConfig(without)).toThrow(/AUDIT_SECRET is required. Generate one with/);
  });

  it("rejects a short one without echoing it", () => {
    let message = "";
    try {
      loadServerConfig({ ...base, AUDIT_SECRET: "short-audit-value" });
    } catch (err) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toMatch(/AUDIT_SECRET must be at least 32 characters/);
    expect(message).not.toContain("short-audit-value");
  });
});