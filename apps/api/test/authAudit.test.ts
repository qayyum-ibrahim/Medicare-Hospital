import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import type { AuditEntry } from "../src/audit/types";
import { NURSE_EMAIL, NURSE_PASSWORD, connected, makeAuthDeps } from "./helpers";

const CLIENT = { "X-Meridian-Client": "web" };

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup() {
  let now = new Date("2026-10-03T09:00:00Z");
  const auth = await makeAuthDeps({ now: () => now });
  const app = createApp({ getDbStatus: connected, auth });
  const entries = async (): Promise<AuditEntry[]> => (await auth.auditRepo.list({ limit: 200 })).reverse();
  return { app, auth, entries, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const header = res.headers["set-cookie"] as string[] | string | undefined;
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const raw = list.find((c) => c.startsWith("meridian_rt=")) ?? "";
  return decodeURIComponent(raw.slice("meridian_rt=".length, raw.indexOf(";")));
}

const loginAs = (app: ReturnType<typeof createApp>, password: string, email = NURSE_EMAIL) =>
  request(app).post("/auth/login").send({ email, password });

describe("sign-in events", () => {
  it("records a successful sign-in with who and from where", async () => {
    const { app, entries } = await setup();
    const res = await loginAs(app, NURSE_PASSWORD);
    const [entry] = await entries();
    expect(entry).toMatchObject({
      action: "auth.login",
      outcome: "success",
      actorId: res.body.user.id,
      actorRole: "nurse",
    });
    expect(typeof entry?.ip).toBe("string");
  });

  it("records a wrong password against the account, without the email or password typed", async () => {
    const { app, auth, entries } = await setup();
    await loginAs(app, "wrong-password-1");
    const nurse = await auth.users.findByEmail(NURSE_EMAIL);
    const [entry] = await entries();
    expect(entry).toMatchObject({
      action: "auth.login_failed",
      outcome: "failure",
      actorId: null,
      entityType: "user",
      entityId: nurse?.id,
      detail: { reason: "wrong_password" },
    });
    const text = JSON.stringify(entry);
    expect(text).not.toContain("wrong-password-1");
    expect(text).not.toContain(NURSE_EMAIL);
  });

  it("records an unknown email without storing it", async () => {
    const { app, entries } = await setup();
    await loginAs(app, "whatever-password-1", "nobody@meridian.example");
    const [entry] = await entries();
    expect(entry).toMatchObject({
      action: "auth.login_failed",
      entityType: null,
      entityId: null,
      detail: { reason: "unknown_user" },
    });
    expect(JSON.stringify(entry)).not.toContain("nobody@meridian.example");
  });

  it("records a switched-off account", async () => {
    const { app, auth, entries } = await setup();
    auth.users.setActive(NURSE_EMAIL, false);
    await loginAs(app, NURSE_PASSWORD);
    expect((await entries())[0]).toMatchObject({ detail: { reason: "inactive_user" } });
  });

  it("records the lockout once, not for every blocked attempt", async () => {
    const { app, entries } = await setup();
    for (let i = 0; i < 5; i++) expect((await loginAs(app, "wrong-password-1")).status).toBe(401);
    const afterFive = await entries();
    expect(afterFive.map((e) => e.action)).toEqual([
      "auth.login_failed",
      "auth.login_failed",
      "auth.login_failed",
      "auth.login_failed",
      "auth.login_failed",
      "auth.login_throttled",
    ]);
    expect(afterFive[5]).toMatchObject({ outcome: "denied", detail: { failures: 5 } });

    for (let i = 0; i < 3; i++) expect((await loginAs(app, NURSE_PASSWORD)).status).toBe(429);
    expect(await entries()).toHaveLength(6);
  });
});

describe("session events", () => {
  it("records a logout once, and nothing for a repeat or for a request with no session", async () => {
    const { app, entries } = await setup();
    const login = await loginAs(app, NURSE_PASSWORD);
    const cookie = cookieOf(login);

    await request(app).post("/auth/logout").set(CLIENT).set("Cookie", `meridian_rt=${cookie}`);
    await request(app).post("/auth/logout").set(CLIENT).set("Cookie", `meridian_rt=${cookie}`);
    await request(app).post("/auth/logout").set(CLIENT);

    const log = await entries();
    expect(log.map((e) => e.action)).toEqual(["auth.login", "auth.logout"]);
    expect(log[1]).toMatchObject({ actorId: login.body.user.id, actorRole: "nurse", entityType: "session" });
  });

  it("records a replayed refresh token as a denied security event, without the tokens", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app, entries, advance } = await setup();
    const login = await loginAs(app, NURSE_PASSWORD);
    const first = cookieOf(login);
    const second = cookieOf(await request(app).post("/auth/refresh").set(CLIENT).set("Cookie", `meridian_rt=${first}`));

    advance(60 * 1000);
    await request(app).post("/auth/refresh").set(CLIENT).set("Cookie", `meridian_rt=${first}`);

    const reuse = (await entries()).find((e) => e.action === "auth.refresh_reuse");
    expect(reuse).toMatchObject({
      outcome: "denied",
      actorId: login.body.user.id,
      actorRole: "nurse",
      entityType: "session",
    });
    const text = JSON.stringify(await entries());
    expect(text).not.toContain(first);
    expect(text).not.toContain(second);
  });
});

describe("refused requests", () => {
  it("records who was refused and what they tried, and records nothing for allowed or anonymous requests", async () => {
    const { app, auth, entries } = await setup();
    const nurse = (await auth.tokens.signAccessToken({ userId: "u-nurse", role: "nurse" })).token;
    const admin = (await auth.tokens.signAccessToken({ userId: "u-admin", role: "admin" })).token;

    expect((await request(app).get("/audit-log").set("Authorization", `Bearer ${nurse}`)).status).toBe(403);
    expect((await request(app).get("/audit-log")).status).toBe(401);
    expect((await request(app).get("/audit-log").set("Authorization", `Bearer ${admin}`)).status).toBe(200);

    const denied = (await entries()).filter((e) => e.action === "access.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      outcome: "denied",
      actorId: "u-nurse",
      actorRole: "nurse",
      detail: { resource: "auditLog", action: "read" },
    });
  });
});

describe("when the audit log is unavailable", () => {
  it("does not stop staff signing in, and reports the problem on the server console", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, auth } = await setup();
    auth.auditRepo.append = async () => {
      throw new Error("database down");
    };
    expect((await loginAs(app, NURSE_PASSWORD)).status).toBe(200);
    expect((await loginAs(app, "wrong-password-1")).status).toBe(401);
    expect(spy.mock.calls.flat().join(" ")).toContain("database down");
  });
});

describe("the log stays trustworthy", () => {
  it("still verifies after a mix of all these events", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app, auth, entries, advance } = await setup();
    await loginAs(app, "wrong-password-1");
    const login = await loginAs(app, NURSE_PASSWORD);
    const first = cookieOf(login);
    await request(app).post("/auth/refresh").set(CLIENT).set("Cookie", `meridian_rt=${first}`);
    advance(60 * 1000);
    await request(app).post("/auth/refresh").set(CLIENT).set("Cookie", `meridian_rt=${first}`);
    const nurse = (await auth.tokens.signAccessToken({ userId: "u-nurse", role: "nurse" })).token;
    await request(app).get("/audit-log").set("Authorization", `Bearer ${nurse}`);

    // The first refresh is routine and is not logged.
    expect((await entries()).map((e) => e.action)).toEqual([
      "auth.login_failed",
      "auth.login",
      "auth.refresh_reuse",
      "access.denied",
    ]);
    expect(await auth.audit.verify()).toMatchObject({ ok: true, checked: 4 });
  });
});