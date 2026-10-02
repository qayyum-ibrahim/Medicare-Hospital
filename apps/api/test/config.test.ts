import { describe, expect, it } from "vitest";
import { loadConfig, redactedHost, scrubSecrets } from "../src/config";

const uri = "mongodb+srv://bob:hunter2@cluster0.example.mongodb.net/meridian?retryWrites=true&w=majority";

describe("loadConfig", () => {
  it("accepts a valid configuration and applies defaults", () => {
    const config = loadConfig({ MONGODB_URI: uri });
    expect(config.PORT).toBe(4000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.MONGODB_URI).toBe(uri);
  });

  it("reads PORT as a number", () => {
    expect(loadConfig({ MONGODB_URI: uri, PORT: "5050" }).PORT).toBe(5050);
  });

  it("rejects a missing connection string with a helpful message", () => {
    expect(() => loadConfig({})).toThrow(/MONGODB_URI is required/);
  });

  it("rejects a connection string with the wrong scheme and never echoes the value", () => {
    const bad = "postgres://alice:s3cret@db.example.com/x";
    let message = "";
    try {
      loadConfig({ MONGODB_URI: bad });
    } catch (err) {
      message = err instanceof Error ? err.message : "";
    }
    expect(message).toMatch(/must start with mongodb/);
    expect(message).not.toContain("s3cret");
    expect(message).not.toContain("alice");
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ MONGODB_URI: uri, PORT: "abc" })).toThrow(/PORT/);
    expect(() => loadConfig({ MONGODB_URI: uri, PORT: "70000" })).toThrow(/PORT/);
  });
});

describe("redactedHost", () => {
  it("returns only the host", () => {
    expect(redactedHost(uri)).toBe("cluster0.example.mongodb.net");
  });

  it("falls back safely for text that is not a URL", () => {
    expect(redactedHost("not a url")).toBe("database");
  });
});

describe("scrubSecrets", () => {
  it("removes credentials from connection strings inside any text", () => {
    const text = `failed to connect to ${uri} after 8s`;
    const scrubbed = scrubSecrets(text);
    expect(scrubbed).not.toContain("hunter2");
    expect(scrubbed).not.toContain("bob");
    expect(scrubbed).toContain("mongodb+srv://***@cluster0.example.mongodb.net");
  });

  it("leaves text without credentials alone", () => {
    expect(scrubSecrets("connection refused")).toBe("connection refused");
  });
});