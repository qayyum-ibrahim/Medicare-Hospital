import { MemoryAuditRepo } from "../src/audit/memoryAuditRepo";
import { createAuditService } from "../src/audit/service";
import { hashPassword } from "../src/auth/password";
import type { AuthDeps } from "../src/auth/routes";
import { createSessionService } from "../src/auth/sessions";
import { LoginThrottle } from "../src/auth/throttle";
import { createTokenService, type TokenService } from "../src/auth/tokens";
import { MemorySessionRepo } from "../src/sessions/memorySessionRepo";
import { MemoryUserRepo } from "../src/users/memoryUserRepo";

export const TEST_SECRET = "test-secret-test-secret-test-secret-1234";
export const FAST = { N: 2 ** 10, r: 8, p: 1 };
export const AUDIT_TEST_SECRET = "audit-secret-audit-secret-audit-12345";
export const NURSE_EMAIL = "nurse@meridian.example";
export const NURSE_PASSWORD = "nurse-password-1";

export const IDLE_MS = 15 * 60 * 1000;
export const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export interface AuthOverrides {
  throttle?: LoginThrottle;
  tokens?: TokenService;
  /** A controllable clock, shared by tokens and sessions. */
  now?: () => Date;
  cookieSecure?: boolean;
}

export async function makeAuthDeps(
  overrides: AuthOverrides = {},
): Promise<AuthDeps & { users: MemoryUserRepo; sessionRepo: MemorySessionRepo; auditRepo: MemoryAuditRepo }> {
  const users = new MemoryUserRepo();
  await users.upsertByEmail({
    name: "Funmilayo Adebayo",
    email: NURSE_EMAIL,
    role: "nurse",
    passwordHash: await hashPassword(NURSE_PASSWORD, FAST),
  });
  const sessionRepo = new MemorySessionRepo();
  const auditRepo = new MemoryAuditRepo();
  const clock = overrides.now ? { now: overrides.now } : {};
  return {
    users,
    sessionRepo,
    auditRepo,
    audit: createAuditService({ repo: auditRepo, secret: AUDIT_TEST_SECRET, ...clock }),
    tokens: overrides.tokens ?? createTokenService(TEST_SECRET, clock),
    throttle: overrides.throttle ?? new LoginThrottle({ maxFailures: 5, windowMs: 15 * 60 * 1000 }),
    sessions: createSessionService({ repo: sessionRepo, idleMs: IDLE_MS, absoluteMs: ABSOLUTE_MS, ...clock }),
    cookieSecure: overrides.cookieSecure ?? false,
    hashParams: FAST,
  };
}

export const connected = async () => ({ connected: true, replicaSet: "rs0" });