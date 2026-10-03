import { POLICY, RESOURCES, ROLES } from "@meridian/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { connected, makeAuthDeps } from "./helpers";

async function setup() {
  const auth = await makeAuthDeps();
  return { app: createApp({ getDbStatus: connected, auth }), tokens: auth.tokens };
}

describe("GET /auth/permissions", () => {
  it("returns exactly what the policy table says for every role", async () => {
    const { app, tokens } = await setup();
    for (const role of ROLES) {
      const { token } = await tokens.signAccessToken({ userId: `user-${role}`, role });
      const res = await request(app).get("/auth/permissions").set("Authorization", `Bearer ${token}`);
      expect(res.status, role).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body.role).toBe(role);
      expect(Object.keys(res.body.permissions).sort()).toEqual([...RESOURCES].sort());
      for (const resource of RESOURCES) {
        expect(res.body.permissions[resource], `${role} / ${resource}`).toEqual({
          read: POLICY[resource][role].read,
          actions: [...POLICY[resource][role].actions],
        });
      }
    }
  });

  it("tells front desk it cannot read clinical notes and tells admin it can read the audit log", async () => {
    const { app, tokens } = await setup();
    const front = await tokens.signAccessToken({ userId: "u1", role: "front_desk" });
    const admin = await tokens.signAccessToken({ userId: "u2", role: "admin" });
    const frontRes = await request(app).get("/auth/permissions").set("Authorization", `Bearer ${front.token}`);
    const adminRes = await request(app).get("/auth/permissions").set("Authorization", `Bearer ${admin.token}`);
    expect(frontRes.body.permissions.clinicalNotes.read).toBe("none");
    expect(adminRes.body.permissions.auditLog.read).toBe("full");
  });

  it("requires a token", async () => {
    const { app } = await setup();
    const res = await request(app).get("/auth/permissions");
    expect(res.status).toBe(401);
  });
});