import { ROLES } from "@meridian/shared";
import { describe, expect, it } from "vitest";
import { verifyPassword } from "../src/auth/password";
import { DEMO_USERS, seedDemoUsers } from "../src/seed/demoUsers";
import { MemoryUserRepo } from "../src/users/memoryUserRepo";

const fast = { N: 2 ** 10, r: 8, p: 1 };

describe("DEMO_USERS", () => {
  it("has exactly one demo user for every role", () => {
    expect(DEMO_USERS.map((u) => u.role).sort()).toEqual([...ROLES].sort());
  });

  it("only uses the reserved .example domain, so no address can belong to a real person", () => {
    for (const user of DEMO_USERS) expect(user.email.endsWith("@meridian.example"), user.email).toBe(true);
  });

  it("has unique emails", () => {
    expect(new Set(DEMO_USERS.map((u) => u.email)).size).toBe(DEMO_USERS.length);
  });
});

describe("seedDemoUsers", () => {
  it("creates every demo user with a hashed password that verifies", async () => {
    const repo = new MemoryUserRepo();
    const result = await seedDemoUsers(repo, "demo-password-1", fast);
    expect(result).toMatchObject({ created: 7, updated: 0 });
    expect(await repo.count()).toBe(7);

    for (const demo of DEMO_USERS) {
      const user = await repo.findByEmail(demo.email);
      expect(user?.role).toBe(demo.role);
      expect(user?.active).toBe(true);
      expect(user?.passwordHash.startsWith("scrypt$")).toBe(true);
      expect(user?.passwordHash).not.toContain("demo-password-1");
      expect(await verifyPassword("demo-password-1", user?.passwordHash ?? "")).toBe(true);
    }
  });

  it("is safe to run again: updates instead of duplicating", async () => {
    const repo = new MemoryUserRepo();
    await seedDemoUsers(repo, "demo-password-1", fast);
    const second = await seedDemoUsers(repo, "demo-password-1", fast);
    expect(second).toMatchObject({ created: 0, updated: 7 });
    expect(await repo.count()).toBe(7);
  });

  it("changes the passwords when seeded again with a new one", async () => {
    const repo = new MemoryUserRepo();
    await seedDemoUsers(repo, "demo-password-1", fast);
    await seedDemoUsers(repo, "demo-password-2", fast);
    const user = await repo.findByEmail("nurse@meridian.example");
    expect(await verifyPassword("demo-password-2", user?.passwordHash ?? "")).toBe(true);
    expect(await verifyPassword("demo-password-1", user?.passwordHash ?? "")).toBe(false);
  });

  it("gives each user a different hash even though they share one password", async () => {
    const repo = new MemoryUserRepo();
    await seedDemoUsers(repo, "demo-password-1", fast);
    const a = await repo.findByEmail("nurse@meridian.example");
    const b = await repo.findByEmail("doctor@meridian.example");
    expect(a?.passwordHash).not.toBe(b?.passwordHash);
  });
});

describe("MemoryUserRepo", () => {
  it("finds users regardless of email case and surrounding spaces", async () => {
    const repo = new MemoryUserRepo();
    await repo.upsertByEmail({ name: "A", email: "Nurse@Meridian.Example", role: "nurse", passwordHash: "x" });
    expect((await repo.findByEmail("  nurse@meridian.example "))?.email).toBe("nurse@meridian.example");
    expect(await repo.findByEmail("nobody@meridian.example")).toBeNull();
  });
});