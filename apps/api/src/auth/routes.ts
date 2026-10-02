import { loginSchema, type Role } from "@meridian/shared";
import { Router } from "express";
import { normalizeEmail, type UserRecord, type UserRepo } from "../users/types";
import { authenticate, getAuth } from "./middleware";
import { DEFAULT_PARAMS, hashPassword, verifyPassword, type ScryptParams } from "./password";
import type { LoginThrottle } from "./throttle";
import type { TokenService } from "./tokens";

export interface AuthDeps {
  users: UserRepo;
  tokens: TokenService;
  throttle: LoginThrottle;
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
    const { token, expiresInSeconds } = await deps.tokens.signAccessToken({ userId: user.id, role: user.role });
    res.json({ accessToken: token, tokenType: "Bearer", expiresInSeconds, user: toPublicUser(user) });
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