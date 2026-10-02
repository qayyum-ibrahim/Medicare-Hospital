import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { authenticate, getAuth } from "../src/auth/middleware";
import { createTokenService } from "../src/auth/tokens";
import { TEST_SECRET } from "./helpers";

function makeApp(tokens = createTokenService(TEST_SECRET)) {
  const app = express();
  app.get("/private", authenticate(tokens), (_req, res) => {
    res.json({ who: getAuth(res) });
  });
  app.get("/no-guard", (_req, res) => {
    res.json({ who: getAuth(res) });
  });
  return { app, tokens };
}

describe("authenticate", () => {
  it("lets a valid bearer token through and exposes the caller", async () => {
    const { app, tokens } = makeApp();
    const { token } = await tokens.signAccessToken({ userId: "user-7", role: "pharmacist" });
    const res = await request(app).get("/private").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.who).toEqual({ userId: "user-7", role: "pharmacist" });
  });

  it("answers 401 with a clear message when there is no token", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/private");
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe("Bearer");
    expect(res.body).toEqual({ error: { code: "unauthenticated", message: "Please sign in" } });
  });

  it("answers 401 for a wrong scheme, a junk token or an expired token", async () => {
    let now = new Date("2026-10-02T10:00:00Z");
    const tokens = createTokenService(TEST_SECRET, { ttlSeconds: 60, now: () => now });
    const { app } = makeApp(tokens);
    const { token } = await tokens.signAccessToken({ userId: "user-1", role: "nurse" });

    expect((await request(app).get("/private").set("Authorization", `Basic ${token}`)).status).toBe(401);
    expect((await request(app).get("/private").set("Authorization", "Bearer not-a-token")).status).toBe(401);
    now = new Date("2026-10-02T11:00:00Z");
    expect((await request(app).get("/private").set("Authorization", `Bearer ${token}`)).status).toBe(401);
  });

  it("makes getAuth fail loudly if a route forgot the guard", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/no-guard");
    expect(res.status).toBe(500);
  });
});