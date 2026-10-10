import { ROLES, type Role } from "@meridian/shared";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { connected, makeAuthDeps } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup() {
  const auth = await makeAuthDeps();
  const app = createApp({ getDbStatus: connected, auth });
  const bearer = async (role: Role) =>
    `Bearer ${(await auth.tokens.signAccessToken({ userId: `user-${role}`, role })).token}`;
  return { app, auth, bearer };
}

describe("who may read the audit log", () => {
  it("lets only admin in, and answers 401 when nobody is signed in", async () => {
    const { app, bearer } = await setup();
    for (const path of ["/audit-log", "/audit-log/verify"]) {
      expect((await request(app).get(path)).status, `${path} without a token`).toBe(401);
      for (const role of ROLES) {
        const res = await request(app).get(path).set("Authorization", await bearer(role));
        expect(res.status, `${role} on ${path}`).toBe(role === "admin" ? 200 : 403);
      }
    }
  });
});

describe("GET /audit-log", () => {
  it("starts empty, then shows that the admin looked, and never exposes the chain links", async () => {
    const { app, bearer } = await setup();
    const admin = await bearer("admin");

    const first = await request(app).get("/audit-log").set("Authorization", admin);
    expect(first.status).toBe(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(first.body).toEqual({ entries: [], nextBefore: null });

    const second = await request(app).get("/audit-log").set("Authorization", admin);
    expect(second.body.entries).toHaveLength(1);
    expect(second.body.entries[0]).toMatchObject({
      seq: 1,
      actorId: "user-admin",
      actorRole: "admin",
      action: "audit.view",
      outcome: "success",
      detail: { returned: 0 },
    });
    expect(second.body.entries[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.body.entries[0]).not.toHaveProperty("prevHash");
  });

  it("pages through the log newest first", async () => {
    const { app, auth, bearer } = await setup();
    for (let i = 1; i <= 7; i++) await auth.audit.record({ action: "audit.verify", detail: { i } });
    const admin = await bearer("admin");

    const page1 = await request(app).get("/audit-log?limit=3").set("Authorization", admin);
    expect(page1.body.entries.map((e: { seq: number }) => e.seq)).toEqual([7, 6, 5]);
    expect(page1.body.nextBefore).toBe(5);

    const page2 = await request(app).get("/audit-log?limit=3&before=5").set("Authorization", admin);
    expect(page2.body.entries.map((e: { seq: number }) => e.seq)).toEqual([4, 3, 2]);
    expect(page2.body.nextBefore).toBe(2);

    const page3 = await request(app).get("/audit-log?limit=3&before=2").set("Authorization", admin);
    expect(page3.body.entries.map((e: { seq: number }) => e.seq)).toEqual([1]);
    expect(page3.body.nextBefore).toBeNull();
  });

  it("filters by action, outcome and actor", async () => {
    const { app, auth, bearer } = await setup();
    await auth.audit.record({ actor: { userId: "u-nurse", role: "nurse" }, action: "access.denied", outcome: "denied" });
    await auth.audit.record({ actor: { userId: "u-doctor", role: "doctor" }, action: "auth.login" });
    const admin = await bearer("admin");

    const byAction = await request(app).get("/audit-log?action=auth.login").set("Authorization", admin);
    expect(byAction.body.entries.map((e: { actorId: string }) => e.actorId)).toEqual(["u-doctor"]);
    const byOutcome = await request(app).get("/audit-log?outcome=denied").set("Authorization", admin);
    expect(byOutcome.body.entries.map((e: { actorId: string }) => e.actorId)).toEqual(["u-nurse"]);
    const byActor = await request(app).get("/audit-log?actorId=u-nurse").set("Authorization", admin);
    expect(byActor.body.entries).toHaveLength(1);
  });

  it("explains a badly formed filter", async () => {
    const { app, bearer } = await setup();
    const admin = await bearer("admin");
    for (const query of ["limit=0", "limit=1000", "action=nope", "outcome=maybe", "before=abc"]) {
      const res = await request(app).get(`/audit-log?${query}`).set("Authorization", admin);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe("validation_error");
    }
  });

  it("refuses to show the log if the act of looking cannot be recorded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, auth, bearer } = await setup();
    await auth.audit.record({ action: "audit.verify", detail: { marker: "visible-only-if-leaked" } });
    auth.auditRepo.append = async () => {
      throw new Error("database down");
    };
    const res = await request(app).get("/audit-log").set("Authorization", await bearer("admin"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("visible-only-if-leaked");
  });
});

describe("GET /audit-log/verify", () => {
  it("confirms an untouched log and records that the check was run", async () => {
    const { app, auth, bearer } = await setup();
    await auth.audit.record({ action: "audit.view" });
    await auth.audit.record({ action: "audit.view" });
    const admin = await bearer("admin");

    const res = await request(app).get("/audit-log/verify").set("Authorization", admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, checked: 2, head: { seq: 2 } });

    const log = await request(app).get("/audit-log?action=audit.verify").set("Authorization", admin);
    expect(log.body.entries[0]).toMatchObject({ actorId: "user-admin", detail: { checked: 2, ok: true } });
  });

  it("reports exactly where a tampered log breaks, and records the failed check", async () => {
    const { app, auth, bearer } = await setup();
    for (let i = 0; i < 4; i++) await auth.audit.record({ action: "audit.view", detail: { returned: i } });
    auth.auditRepo.tamper(2, { detail: { returned: 999 } });
    const admin = await bearer("admin");

    const res = await request(app).get("/audit-log/verify").set("Authorization", admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, checked: 1, firstBadSeq: 2, problem: "This entry has been altered" });

    const log = await request(app).get("/audit-log?action=audit.verify&outcome=failure").set("Authorization", admin);
    expect(log.body.entries).toHaveLength(1);
  });
});