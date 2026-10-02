import { describe, expect, it } from "vitest";
import { loadSeedConfig } from "../src/config";

const uri = "mongodb+srv://bob:hunter2@cluster0.example.mongodb.net/meridian";

describe("loadSeedConfig", () => {
  it("accepts a connection string and a demo password", () => {
    const config = loadSeedConfig({ MONGODB_URI: uri, DEMO_PASSWORD: "a-long-demo-password" });
    expect(config.DEMO_PASSWORD).toBe("a-long-demo-password");
    expect(config.PORT).toBe(4000);
  });

  it("explains how to fix a missing demo password", () => {
    expect(() => loadSeedConfig({ MONGODB_URI: uri })).toThrow(/DEMO_PASSWORD is required for seeding/);
  });

  it("rejects a short demo password without echoing it", () => {
    let message = "";
    try {
      loadSeedConfig({ MONGODB_URI: uri, DEMO_PASSWORD: "short-pw" });
    } catch (err) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toMatch(/at least 10 characters/);
    expect(message).not.toContain("short-pw");
  });

  it("still checks the connection string", () => {
    expect(() => loadSeedConfig({ DEMO_PASSWORD: "a-long-demo-password" })).toThrow(/MONGODB_URI is required/);
  });
});