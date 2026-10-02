import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { createTokenService } from "../src/auth/tokens";
import { TEST_SECRET } from "./helpers";

const key = new TextEncoder().encode(TEST_SECRET);

describe("createTokenService", () => {
  it("signs a token that verifies back to the same user and role", async () => {
    const tokens = createTokenService(TEST_SECRET);
    const { token, expiresInSeconds } = await tokens.signAccessToken({ userId: "user-1", role: "doctor" });
    expect(expiresInSeconds).toBe(900);
    expect(await tokens.verifyAccessToken(token)).toEqual({ userId: "user-1", role: "doctor" });
  });

  it("rejects a token after it expires", async () => {
    let now = new Date("2026-10-02T10:00:00Z");
    const tokens = createTokenService(TEST_SECRET, { ttlSeconds: 60, now: () => now });
    const { token } = await tokens.signAccessToken({ userId: "user-1", role: "nurse" });

    now = new Date("2026-10-02T10:00:59Z");
    expect(await tokens.verifyAccessToken(token)).not.toBeNull();
    now = new Date("2026-10-02T10:01:01Z");
    expect(await tokens.verifyAccessToken(token)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const other = createTokenService("another-secret-another-secret-123456");
    const { token } = await other.signAccessToken({ userId: "user-1", role: "admin" });
    expect(await createTokenService(TEST_SECRET).verifyAccessToken(token)).toBeNull();
  });

  it("rejects a token that has been tampered with", async () => {
    const tokens = createTokenService(TEST_SECRET);
    const { token } = await tokens.signAccessToken({ userId: "user-1", role: "nurse" });
    const [header, payload, signature] = token.split(".");
    const forged = JSON.parse(Buffer.from(payload ?? "", "base64url").toString());
    forged.role = "admin";
    const forgedPayload = Buffer.from(JSON.stringify(forged)).toString("base64url");
    expect(await tokens.verifyAccessToken(`${header}.${forgedPayload}.${signature}`)).toBeNull();
  });

  it("rejects an unsigned token (alg none)", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "user-1", role: "admin", iss: "meridian-care-api", aud: "meridian-care-web", exp: 9999999999 }),
    ).toString("base64url");
    expect(await createTokenService(TEST_SECRET).verifyAccessToken(`${header}.${payload}.`)).toBeNull();
  });

  it("rejects a token for another audience or with an unknown role", async () => {
    const tokens = createTokenService(TEST_SECRET);
    const wrongAudience = await new SignJWT({ role: "nurse" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuer("meridian-care-api")
      .setAudience("someone-else")
      .setExpirationTime("15m")
      .sign(key);
    const wrongRole = await new SignJWT({ role: "janitor" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setIssuer("meridian-care-api")
      .setAudience("meridian-care-web")
      .setExpirationTime("15m")
      .sign(key);
    expect(await tokens.verifyAccessToken(wrongAudience)).toBeNull();
    expect(await tokens.verifyAccessToken(wrongRole)).toBeNull();
  });

  it("returns null for garbage instead of throwing", async () => {
    const tokens = createTokenService(TEST_SECRET);
    for (const junk of ["", "abc", "a.b.c", "Bearer x"]) {
      expect(await tokens.verifyAccessToken(junk), junk).toBeNull();
    }
  });

  it("refuses a secret that is too short", () => {
    expect(() => createTokenService("too-short")).toThrow(/at least 32 characters/);
  });
});