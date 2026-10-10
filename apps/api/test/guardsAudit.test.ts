import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createGuards, type DeniedInfo } from "../src/auth/guards";
import { createTokenService } from "../src/auth/tokens";
import { TEST_SECRET } from "./helpers";

const tokens = createTokenService(TEST_SECRET);

function setup(onDenied: (info: DeniedInfo) => void | Promise<void>) {
  const guards = createGuards(tokens, onDenied);
  const app = express();
  app.get("/claims", guards.requireRead("claims"), (_req, res) => {
    res.json({ ok: true });
  });
  app.post("/claims", guards.requireAction("claims", "write"), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

async function bearer(role: "nurse" | "billing") {
  return `Bearer ${(await tokens.signAccessToken({ userId: `u-${role}`, role })).token}`;
}

describe("the denied hook", () => {
  it("is told who tried to read what, when a signed-in role is refused", async () => {
    const seen: DeniedInfo[] = [];
    const app = setup((info) => {
      seen.push(info);
    });
    const res = await request(app).get("/claims").set("Authorization", await bearer("nurse"));
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      actor: { userId: "u-nurse", role: "nurse" },
      resource: "claims",
      action: "read",
    });
    expect(typeof seen[0]?.ip === "string" || seen[0]?.ip === null).toBe(true);
  });

  it("reports the action when an action is refused", async () => {
    const seen: DeniedInfo[] = [];
    const app = setup((info) => {
      seen.push(info);
    });
    await request(app).post("/claims").set("Authorization", await bearer("nurse"));
    expect(seen[0]).toMatchObject({ resource: "claims", action: "write" });
  });

  it("stays quiet when access is allowed or when nobody is signed in", async () => {
    const seen: DeniedInfo[] = [];
    const app = setup((info) => {
      seen.push(info);
    });
    expect((await request(app).get("/claims").set("Authorization", await bearer("billing"))).status).toBe(200);
    expect((await request(app).get("/claims")).status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it("finishes writing its record before the refusal is sent", async () => {
    let written = false;
    const app = setup(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      written = true;
    });
    const res = await request(app).get("/claims").set("Authorization", await bearer("nurse"));
    expect(res.status).toBe(403);
    expect(written).toBe(true);
  });

  it("works without a hook", async () => {
    const guards = createGuards(tokens);
    const app = express();
    app.get("/claims", guards.requireRead("claims"), (_req, res) => {
      res.json({ ok: true });
    });
    expect((await request(app).get("/claims").set("Authorization", await bearer("nurse"))).status).toBe(403);
  });
});