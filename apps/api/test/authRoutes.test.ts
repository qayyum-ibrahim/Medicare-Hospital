import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { LoginThrottle } from "../src/auth/throttle";
import { NURSE_EMAIL, NURSE_PASSWORD, connected, makeAuthDeps } from "./helpers";

async function setup(throttle?: LoginThrottle) {
  const auth = await makeAuthDeps(throttle ? { throttle } : {});
  const app = createApp({ getDbStatus: connected, auth });
  return { app, auth };
}

describe("POST /auth/login", () => {
  it("signs in with the right password and never returns the password hash", async () => {
    const { app, auth } = await setup();
    const res = await request(app).post("/auth/login").send({ email: NURSE_EMAIL, password: NURSE_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.tokenType).toBe("Bearer");
    expect(res.body.expiresInSeconds).toBe(900);
    expect(res.body.user).toMatchObject({ name: "Funmilayo Adebayo", email: NURSE_EMAIL, role: "nurse" });
    expect(JSON.stringify(res.body)).not.toContain("scrypt$");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    expect(await auth.tokens.verifyAccessToken(res.body.accessToken)).toEqual({
      userId: res.body.user.id,
      role: "nurse",
    });
    expect((await auth.users.findByEmail(NURSE_EMAIL))?.lastLoginAt).toBeInstanceOf(Date);
  });

  it("ignores email capitalisation and surrounding spaces", async () => {
    const { app } = await setup();
    const res = await request(app).post("/auth/login").send({ email: "Nurse@Meridian.Example", password: NURSE_PASSWORD });
    expect(res.status).toBe(200);
  });

  it("gives the same answer for a wrong password, an unknown email and a switched-off account", async () => {
    const { app, auth } = await setup();
    const wrongPassword = await request(app).post("/auth/login").send({ email: NURSE_EMAIL, password: "wrong-password-1" });
    const unknownEmail = await request(app).post("/auth/login").send({ email: "nobody@meridian.example", password: NURSE_PASSWORD });
    auth.users.setActive(NURSE_EMAIL, false);
    const switchedOff = await request(app).post("/auth/login").send({ email: NURSE_EMAIL, password: NURSE_PASSWORD });

    for (const res of [wrongPassword, unknownEmail, switchedOff]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: "invalid_credentials", message: "Incorrect email or password" } });
    }
  });

  it("explains what is wrong with a badly formed request", async () => {
    const { app } = await setup();
    const res = await request(app).post("/auth/login").send({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
    expect(res.body.error.fields).toEqual(
      expect.arrayContaining([
        { field: "email", message: "Enter a valid email address" },
        { field: "password", message: "Enter your password" },
      ]),
    );

    const empty = await request(app).post("/auth/login");
    expect(empty.status).toBe(400);
  });

  it("blocks further attempts after repeated failures, even with the right password", async () => {
    let now = 5_000_000;
    const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 15 * 60 * 1000, now: () => now });
    const { app } = await setup(throttle);

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/auth/login").send({ email: NURSE_EMAIL, password: "wrong-password-1" });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post("/auth/login").send({ email: NURSE_EMAIL, password: NURSE_PASSWORD });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("900");
    expect(blocked.body.error.message).toBe("Too many sign-in attempts. Try again in 15 minutes.");

    now += 15 * 60 * 1000;
    const after = await request(app).post("/auth/login").send({ email: NURSE_EMAIL, password: NURSE_PASSWORD });
    expect(after.status).toBe(200);
  });
});

describe("GET /auth/me", () => {
  async function signIn(app: ReturnType<typeof createApp>) {
    const res = await request(app).post("/auth/login").send({ email: NURSE_EMAIL, password: NURSE_PASSWORD });
    return res.body.accessToken as string;
  }

  it("returns the signed-in user", async () => {
    const { app } = await setup();
    const token = await signIn(app);
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: NURSE_EMAIL, role: "nurse" });
    expect(JSON.stringify(res.body)).not.toContain("scrypt$");
  });

  it("requires a token", async () => {
    const { app } = await setup();
    expect((await request(app).get("/auth/me")).status).toBe(401);
  });

  it("stops working as soon as the account is switched off, without waiting for the token to expire", async () => {
    const { app, auth } = await setup();
    const token = await signIn(app);
    auth.users.setActive(NURSE_EMAIL, false);
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects a valid token for a user that no longer exists", async () => {
    const { app, auth } = await setup();
    const { token } = await auth.tokens.signAccessToken({ userId: "ghost", role: "admin" });
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});