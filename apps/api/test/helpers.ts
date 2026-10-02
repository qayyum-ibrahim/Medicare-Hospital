import { hashPassword } from "../src/auth/password";
import { LoginThrottle } from "../src/auth/throttle";
import { createTokenService } from "../src/auth/tokens";
import type { AuthDeps } from "../src/auth/routes";
import { MemoryUserRepo } from "../src/users/memoryUserRepo";

export const TEST_SECRET = "test-secret-test-secret-test-secret-1234";
export const FAST = { N: 2 ** 10, r: 8, p: 1 };
export const NURSE_EMAIL = "nurse@meridian.example";
export const NURSE_PASSWORD = "nurse-password-1";

export async function makeAuthDeps(
  overrides: Partial<Pick<AuthDeps, "throttle" | "tokens">> = {},
): Promise<AuthDeps & { users: MemoryUserRepo }> {
  const users = new MemoryUserRepo();
  await users.upsertByEmail({
    name: "Funmilayo Adebayo",
    email: NURSE_EMAIL,
    role: "nurse",
    passwordHash: await hashPassword(NURSE_PASSWORD, FAST),
  });
  return {
    users,
    tokens: overrides.tokens ?? createTokenService(TEST_SECRET),
    throttle: overrides.throttle ?? new LoginThrottle({ maxFailures: 5, windowMs: 15 * 60 * 1000 }),
    hashParams: FAST,
  };
}

export const connected = async () => ({ connected: true, replicaSet: "rs0" });