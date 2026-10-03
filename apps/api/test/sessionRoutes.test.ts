import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { IDLE_MS, NURSE_EMAIL, NURSE_PASSWORD, connected, makeAuthDeps, type AuthOverrides } from "./helpers";

const CLIENT = { "X-Meridian-Client": "web" };
const MINUTE = 60 * 1000;

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(overrides: AuthOverrides = {}) {
  let now = new Date("2026-10-02T09:00:00Z");
  const auth = await makeAuthDeps({ now: () => now, ...overrides });
  const app = createApp({ getDbStatus: connected, auth });
  return { app, auth, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

type App = Awaited<ReturnType<typeof setup>>["app"];

function refreshCookie(res: { headers: Record<string, unknown> }): { raw: string; value: string } | null {
  const header = res.headers["set-cookie"] as string[] | string | undefined;
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const raw = list.find((c) => c.startsWith("meridian_rt="));
  if (!raw) return null;
  return { raw, value: decodeURIComponent(raw.slice("meridian_rt=".length, raw.indexOf(";"))) };
}

async function login(app: App) {
  const res = await request(app).post("/auth/login").send({ email: NURSE_EMAIL, password: NURSE_PASSWORD });
  const cookie = refreshCookie(res);
  if (!cookie) throw new Error("login did not set a refresh cookie");
  return { res, token: res.body.accessToken as string, cookie: cookie.value };
}

function refresh(app: App, cookieValue: string) {
  return request(app).post("/auth/refresh").set(CLIENT).set("Cookie", `meridian_rt=${cookieValue}`);
}

describe("the refresh cookie", () => {
  it("is hidden from page scripts, never sent cross-site, limited to /auth, and expires with the session", async () => {
    const { app } = await setup();
    const { res, cookie } = await login(app);
    const raw = refreshCookie(res)?.raw ?? "";
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=Strict");
    expect(raw).toContain("Path=/auth");
    expect(raw).toContain("Expires=Fri, 02 Oct 2026 21:00:00 GMT");
    expect(raw).not.toContain("Secure");
    expect(JSON.stringify(res.body)).not.toContain(cookie);
  });

  it("is marked Secure when the server runs in production", async () => {
    const { app } = await setup({ cookieSecure: true });
    const { res } = await login(app);
    expect(refreshCookie(res)?.raw).toContain("Secure");
  });

  it("is stored only as a hash", async () => {
    const { app, auth } = await setup();
    const { cookie } = await login(app);
    expect(JSON.stringify(auth.sessionRepo.all())).not.toContain(cookie);
  });
});

describe("POST /auth/refresh", () => {
  it("gives a new access token and a new refresh cookie", async () => {
    const { app, auth } = await setup();
    const { cookie, res: loginRes } = await login(app);
    const res = await refresh(app, cookie);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.user).toMatchObject({ email: NURSE_EMAIL, role: "nurse" });
    expect(await auth.tokens.verifyAccessToken(res.body.accessToken)).toEqual({
      userId: loginRes.body.user.id,
      role: "nurse",
    });
    const next = refreshCookie(res);
    expect(next?.value).toBeTruthy();
    expect(next?.value).not.toBe(cookie);
    expect(JSON.stringify(res.body)).not.toContain(next?.value ?? "x");
  });

  it("is blocked without the web app's header, and the session survives the blocked attempt", async () => {
    const { app } = await setup();
    const { cookie } = await login(app);
    const blocked = await request(app).post("/auth/refresh").set("Cookie", `meridian_rt=${cookie}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("request_blocked");
    expect((await refresh(app, cookie)).status).toBe(200);
  });

  it("ends the session when there is no cookie or the cookie is junk, and clears the cookie", async () => {
    const { app } = await setup();
    for (const res of [
      await request(app).post("/auth/refresh").set(CLIENT),
      await refresh(app, "junk-value"),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("session_expired");
      expect(refreshCookie(res)?.raw).toContain("Expires=Thu, 01 Jan 1970");
    }
  });

  it("ends the session after the idle limit", async () => {
    const { app, advance } = await setup();
    const { cookie } = await login(app);
    advance(IDLE_MS + MINUTE);
    const res = await refresh(app, cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("session_expired");
  });

  it("keeps an active person signed in for the shift, then ends the session at the absolute limit", async () => {
    const { app, advance } = await setup();
    let { cookie } = await login(app);
    let refreshes = 0;
    for (let i = 0; i < 72; i++) {
      advance(10 * MINUTE);
      const res = await refresh(app, cookie);
      if (res.status !== 200) {
        expect(res.status).toBe(401);
        break;
      }
      cookie = refreshCookie(res)?.value ?? "";
      refreshes++;
    }
    expect(refreshes).toBe(71);
  });

  it("revokes the whole session when a replaced token is used again after the grace period", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app, advance } = await setup();
    const { cookie: first } = await login(app);
    const second = refreshCookie(await refresh(app, first))?.value ?? "";

    advance(60 * 1000);
    const replay = await refresh(app, first);
    expect(replay.status).toBe(401);
    expect((await refresh(app, second)).status).toBe(401);

    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("revoked");
    expect(logged).not.toContain(first);
    expect(logged).not.toContain(second);
  });

  it("treats a quick repeat of the same token as a harmless race and keeps the session", async () => {
    const { app } = await setup();
    const { cookie: first } = await login(app);
    const second = refreshCookie(await refresh(app, first))?.value ?? "";

    const repeat = await refresh(app, first);
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe("refresh_in_progress");
    expect(repeat.headers["set-cookie"]).toBeUndefined();
    expect((await refresh(app, second)).status).toBe(200);
  });

  it("lets exactly one of two simultaneous refreshes win", async () => {
    const { app } = await setup();
    const { cookie } = await login(app);
    const results = await Promise.all([refresh(app, cookie), refresh(app, cookie)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("ends the session at once if the account has been switched off", async () => {
    const { app, auth } = await setup();
    const { cookie } = await login(app);
    auth.users.setActive(NURSE_EMAIL, false);
    const res = await refresh(app, cookie);
    expect(res.status).toBe(401);
    expect(auth.sessionRepo.all()[0]?.revokedAt).not.toBeNull();
  });

  it("picks up a changed role at the next refresh", async () => {
    const { app, auth } = await setup();
    const { cookie } = await login(app);
    const existing = await auth.users.findByEmail(NURSE_EMAIL);
    await auth.users.upsertByEmail({
      name: "Funmilayo Adebayo",
      email: NURSE_EMAIL,
      role: "doctor",
      passwordHash: existing?.passwordHash ?? "",
    });
    const res = await refresh(app, cookie);
    expect(res.status).toBe(200);
    expect((await auth.tokens.verifyAccessToken(res.body.accessToken))?.role).toBe("doctor");
  });
});

describe("POST /auth/logout", () => {
  it("ends the session on the server and clears the cookie", async () => {
    const { app } = await setup();
    const { cookie } = await login(app);
    const res = await request(app).post("/auth/logout").set(CLIENT).set("Cookie", `meridian_rt=${cookie}`);
    expect(res.status).toBe(204);
    expect(refreshCookie(res)?.raw).toContain("Expires=Thu, 01 Jan 1970");
    expect((await refresh(app, cookie)).status).toBe(401);
  });

  it("succeeds quietly when repeated or when there is no cookie", async () => {
    const { app } = await setup();
    const { cookie } = await login(app);
    const once = await request(app).post("/auth/logout").set(CLIENT).set("Cookie", `meridian_rt=${cookie}`);
    const twice = await request(app).post("/auth/logout").set(CLIENT).set("Cookie", `meridian_rt=${cookie}`);
    const none = await request(app).post("/auth/logout").set(CLIENT);
    expect([once.status, twice.status, none.status]).toEqual([204, 204, 204]);
  });

  it("is blocked without the web app's header and does not end the session", async () => {
    const { app } = await setup();
    const { cookie } = await login(app);
    const blocked = await request(app).post("/auth/logout").set("Cookie", `meridian_rt=${cookie}`);
    expect(blocked.status).toBe(403);
    expect((await refresh(app, cookie)).status).toBe(200);
  });

  it("only ends the session it was called for", async () => {
    const { app } = await setup();
    const a = await login(app);
    const b = await login(app);
    await request(app).post("/auth/logout").set(CLIENT).set("Cookie", `meridian_rt=${a.cookie}`);
    expect((await refresh(app, a.cookie)).status).toBe(401);
    expect((await refresh(app, b.cookie)).status).toBe(200);
  });
});
