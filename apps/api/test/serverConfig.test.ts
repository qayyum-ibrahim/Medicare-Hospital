import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../src/config";

const base = {
  MONGODB_URI: "mongodb+srv://bob:hunter2@cluster0.example.mongodb.net/meridian",
  JWT_ACCESS_SECRET: "x".repeat(40),
};

describe("loadServerConfig", () => {
  it("accepts a valid configuration and defaults tokens to 15 minutes", () => {
    const config = loadServerConfig(base);
    expect(config.ACCESS_TOKEN_MINUTES).toBe(15);
    expect(config.PORT).toBe(4000);
  });

  it("reads a custom token lifetime", () => {
    expect(loadServerConfig({ ...base, ACCESS_TOKEN_MINUTES: "30" }).ACCESS_TOKEN_MINUTES).toBe(30);
    expect(() => loadServerConfig({ ...base, ACCESS_TOKEN_MINUTES: "0" })).toThrow(/ACCESS_TOKEN_MINUTES/);
    expect(() => loadServerConfig({ ...base, ACCESS_TOKEN_MINUTES: "600" })).toThrow(/ACCESS_TOKEN_MINUTES/);
  });

  it("tells you how to generate a missing secret", () => {
    const { JWT_ACCESS_SECRET: _omit, ...withoutSecret } = base;
    expect(() => loadServerConfig(withoutSecret)).toThrow(/JWT_ACCESS_SECRET is required. Generate one with/);
  });

  it("rejects a short secret without echoing it", () => {
    let message = "";
    try {
      loadServerConfig({ ...base, JWT_ACCESS_SECRET: "short-secret-value" });
    } catch (err) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toMatch(/at least 32 characters/);
    expect(message).not.toContain("short-secret-value");
  });
});