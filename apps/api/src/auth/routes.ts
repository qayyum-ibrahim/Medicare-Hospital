import { loginSchema, type Role } from "@meridian/shared";
import { Router, type Response } from "express";
import { normalizeEmail, type UserRecord, type UserRepo } from "../users/types";
import { REFRESH_COOKIE, hasClientHeader, readCookie, refreshCookieOptions } from "./cookies";
import { authenticate, getAuth } from "./middleware";
import { DEFAULT_PARAMS, hashPassword, verifyPassword, type ScryptParams } from "./password";
import type { SessionService } from "./sessions";
import type { LoginThrottle } from "./throttle";
import type { TokenService } from "./tokens";

export interface AuthDeps {
  users: UserRepo;
  tokens: TokenService;
  throttle: LoginThrottle;
  sessions: SessionService;
  /** Send the refresh cookie only over HTTPS. True in production. */
  cookieSecure: boolean;
  /** Cost used for the decoy hash. Tests pass a cheap one. */
  hashParams?: ScryptParams;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const badLogin = { error: { code: "invalid_credentials", message: "Incorrect email or password" } };

export function createAuthRouter(deps: AuthDeps): Router {
  const router = Router();
  const hashParams = deps.hashParams ?? DEFAULT_PARAMS;

  // A decoy hash, so a sign-in for an unknown email takes as long as one for a real email.
  let decoy: Promise<string> | undefined;
  const getDecoyHash = () => (decoy ??= hashPassword("not-a-real-password", hashParams));

  function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, { ...refreshCookieOptions(deps.cookieSecure), expires: expiresAt });
  }

  function endSession(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(deps.cookieSecure));
    res.status(401).json({
      error: { code: "session_expired", message: "Your session has ended. Please sign in again." },
    });
  }

  function blockedByClientCheck(res: Response): void {
    res.status(403).json({ error: { code: "request_blocked", message: "Request blocked" } });
  }

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "validation_error",
          message: "Check your email and password",
          fields: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
        },
      });
      return;
    }
    const { email, password } = parsed.data;

    const throttleKey = `${req.ip ?? "unknown"}|${normalizeEmail(email)}`;
    const gate = deps.throttle.check(throttleKey);
    if (!gate.allowed) {
      const minutes = Math.ceil(gate.retryAfterSeconds / 60);
      res
        .set("Retry-After", String(gate.retryAfterSeconds))
        .status(429)
        .json({
          error: {
            code: "too_many_attempts",
            message: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          },
        });
      return;
    }

    const user = await deps.users.findByEmail(email);
    const usable = user !== null && user.active;
    const passwordOk = await verifyPassword(password, usable ? user.passwordHash : await getDecoyHash());
    if (!usable || !passwordOk) {
      deps.throttle.recordFailure(throttleKey);
      res.status(401).json(badLogin);
      return;
    }

    deps.throttle.recordSuccess(throttleKey);
    await deps.users.recordLogin(user.id, new Date());
    const session = await deps.sessions.start(user.id);
    setRefreshCookie(res, session.refreshToken, session.expiresAt);
    const { token, expiresInSeconds } = await deps.tokens.signAccessToken({ userId: user.id, role: user.role });
    res.json({ accessToken: token, tokenType: "Bearer", expiresInSeconds, user: toPublicUser(user) });
  });

  router.post("/refresh", async (req, res) => {
    if (!hasClientHeader(req)) {
      blockedByClientCheck(res);
      return;
    }
    const presented = readCookie(req.get("cookie"), REFRESH_COOKIE);
    if (!presented) {
      endSession(res);
      return;
    }

    const result = await deps.sessions.rotate(presented);
    if (!result.ok) {
      if (result.reason === "retry") {
        // Another refresh from the same browser got there first. Not an attack: try again.
        res.status(409).json({
          error: { code: "refresh_in_progress", message: "Another refresh is in progress. Try again." },
        });
        return;
      }
      if (result.reason === "reuse") {
        console.warn(
          `Security: a replaced refresh token was used again. Session ${result.sessionId} (user ${result.userId}) revoked.`,
        );
      }
      endSession(res);
      return;
    }

    // Read the user afresh: a role change or a switched-off account takes effect here.
    const user = await deps.users.findById(result.userId);
    if (!user || !user.active) {
      await deps.sessions.revoke(result.refreshToken);
      endSession(res);
      return;
    }

    setRefreshCookie(res, result.refreshToken, result.expiresAt);
    const { token, expiresInSeconds } = await deps.tokens.signAccessToken({ userId: user.id, role: user.role });
    res.json({ accessToken: token, tokenType: "Bearer", expiresInSeconds, user: toPublicUser(user) });
  });

  router.post("/logout", async (req, res) => {
    if (!hasClientHeader(req)) {
      blockedByClientCheck(res);
      return;
    }
    const presented = readCookie(req.get("cookie"), REFRESH_COOKIE);
    if (presented) await deps.sessions.revoke(presented);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(deps.cookieSecure));
    res.status(204).end();
  });

  router.get("/me", authenticate(deps.tokens), async (_req, res) => {
    const user = await deps.users.findById(getAuth(res).userId);
    if (!user || !user.active) {
      res
        .set("WWW-Authenticate", "Bearer")
        .status(401)
        .json({ error: { code: "unauthenticated", message: "Please sign in" } });
      return;
    }
    res.json({ user: toPublicUser(user) });
  });

  return router;
}