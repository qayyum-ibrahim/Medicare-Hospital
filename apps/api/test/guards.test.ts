import { ACTIONS, POLICY, RESOURCES, ROLES, canDo, canRead, type Role } from "@meridian/shared";
import express from "express";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGuards, getReadLevel } from "../src/auth/guards";
import { createTokenService } from "../src/auth/tokens";
import { TEST_SECRET } from "./helpers";

const tokens = createTokenService(TEST_SECRET);
const guards = createGuards(tokens);

// One test route for every resource: a read route and an action route per action.
const app = express();
for (const resource of RESOURCES) {
  app.get(`/read/${resource}`, guards.requireRead(resource), (_req, res) => {
    res.json({ level: getReadLevel(res) });
  });
  for (const action of ACTIONS) {
    app.post(`/do/${resource}/${action}`, guards.requireAction(resource, action), (_req, res) => {
      res.json({ ok: true });
    });
  }
}

let server: Server;
const bearer: Partial<Record<Role, string>> = {};

beforeAll(async () => {
  server = app.listen(0);
  for (const role of ROLES) {
    bearer[role] = `Bearer ${(await tokens.signAccessToken({ userId: `user-${role}`, role })).token}`;
  }
});

afterAll(() => {
  server.close();
});

function as(role: Role) {
  return { Authorization: bearer[role] ?? "" };
}

describe("role guards enforce the policy table on every route", () => {
  it("allows or refuses reading for every role and resource, and passes on the read level", { timeout: 60_000 }, async () => {
    for (const role of ROLES) {
      const results = await Promise.all(
        RESOURCES.map(async (resource) => {
          const res = await request(server).get(`/read/${resource}`).set(as(role));
          return { resource, status: res.status, level: res.body.level as string | undefined };
        }),
      );
      for (const { resource, status, level } of results) {
        const allowed = canRead(role, resource);
        expect(status, `${role} reading ${resource}`).toBe(allowed ? 200 : 403);
        if (allowed) expect(level, `${role} read level on ${resource}`).toBe(POLICY[resource][role].read);
      }
    }
  });

  it("allows or refuses every action for every role, resource and action", { timeout: 60_000 }, async () => {
    let checked = 0;
    for (const role of ROLES) {
      const results = await Promise.all(
        RESOURCES.flatMap((resource) =>
          ACTIONS.map(async (action) => {
            const res = await request(server).post(`/do/${resource}/${action}`).set(as(role));
            return { resource, action, status: res.status };
          }),
        ),
      );
      for (const { resource, action, status } of results) {
        expect(status, `${role} doing ${action} on ${resource}`).toBe(canDo(role, resource, action) ? 200 : 403);
        checked++;
      }
    }
    expect(checked).toBe(ROLES.length * RESOURCES.length * ACTIONS.length);
  });

  it("answers 401, not 403, when nobody is signed in, even on a route no role may use", async () => {
    const readRes = await request(server).get("/read/claims");
    expect(readRes.status).toBe(401);
    expect(readRes.headers["www-authenticate"]).toBe("Bearer");
    expect((await request(server).post("/do/claims/override")).status).toBe(401);
    expect((await request(server).get("/read/auditLog").set("Authorization", "Bearer junk")).status).toBe(401);
  });

  it("gives a refusal that reveals nothing about the policy", async () => {
    const res = await request(server).get("/read/auditLog").set(as("front_desk"));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "forbidden", message: "You do not have access to this" } });
  });

  it("spot-checks the cases that matter most to the demo", async () => {
    expect((await request(server).get("/read/clinicalNotes").set(as("front_desk"))).status).toBe(403);
    expect((await request(server).get("/read/auditLog").set(as("admin"))).status).toBe(200);
    expect((await request(server).get("/read/auditLog").set(as("billing"))).status).toBe(403);
    expect((await request(server).post("/do/prescriptions/dispense").set(as("pharmacist"))).status).toBe(200);
    expect((await request(server).post("/do/prescriptions/dispense").set(as("doctor"))).status).toBe(403);
    expect((await request(server).post("/do/claims/write").set(as("billing"))).status).toBe(200);
    expect((await request(server).post("/do/claims/write").set(as("admin"))).status).toBe(403);
    const masked = await request(server).get("/read/demographics").set(as("admin"));
    expect(masked.body.level).toBe("masked");
  });
});