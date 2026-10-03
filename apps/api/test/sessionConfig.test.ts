import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../src/config";

const base = {
  MONGODB_URI: "mongodb+srv://bob:hunter2@cluster0.example.mongodb.net/meridian",
  JWT_ACCESS_SECRET: "x".repeat(40),
};

describe("session settings", () => {
  it("defaults to 15 minutes idle and 12 hours absolute", () => {
    const config = loadServerConfig(base);
    expect(config.SESSION_IDLE_MINUTES).toBe(15);
    expect(config.SESSION_ABSOLUTE_HOURS).toBe(12);
  });

  it("reads custom values and rejects out-of-range ones", () => {
    const custom = loadServerConfig({ ...base, SESSION_IDLE_MINUTES: "30", SESSION_ABSOLUTE_HOURS: "8" });
    expect(custom.SESSION_IDLE_MINUTES).toBe(30);
    expect(custom.SESSION_ABSOLUTE_HOURS).toBe(8);
    expect(() => loadServerConfig({ ...base, SESSION_IDLE_MINUTES: "0" })).toThrow(/SESSION_IDLE_MINUTES/);
    expect(() => loadServerConfig({ ...base, SESSION_IDLE_MINUTES: "500" })).toThrow(/SESSION_IDLE_MINUTES/);
    expect(() => loadServerConfig({ ...base, SESSION_ABSOLUTE_HOURS: "100" })).toThrow(/SESSION_ABSOLUTE_HOURS/);
  });
});