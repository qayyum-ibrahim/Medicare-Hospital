import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, hashPassword, verifyPassword } from "../src/auth/password";

// Low cost so the tests run fast. One test below uses the real default cost.
const fast = { N: 2 ** 10, r: 8, p: 1 };

describe("hashPassword and verifyPassword", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery", fast);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("never stores the password and uses a new salt every time", async () => {
    const a = await hashPassword("same-password-1", fast);
    const b = await hashPassword("same-password-1", fast);
    expect(a).not.toBe(b);
    expect(a).not.toContain("same-password-1");
    expect(await verifyPassword("same-password-1", a)).toBe(true);
    expect(await verifyPassword("same-password-1", b)).toBe(true);
  });

  it("records the cost in the stored value so old hashes keep working if the cost is raised later", async () => {
    const stored = await hashPassword("pw-123456789", fast);
    expect(stored.startsWith("scrypt$1024$8$1$")).toBe(true);
    expect(await verifyPassword("pw-123456789", stored)).toBe(true);
  });

  it("treats composed and decomposed unicode as the same password", async () => {
    const stored = await hashPassword("caf\u00E9-password", fast);
    expect(await verifyPassword("cafe\u0301-password", stored)).toBe(true);
  });

  it("refuses to hash an empty password", async () => {
    await expect(hashPassword("", fast)).rejects.toThrow("Password cannot be empty");
  });

  it("returns false, and never throws, for malformed stored hashes", async () => {
    const good = await hashPassword("pw-123456789", fast);
    const salt = good.split("$")[4];
    const malformed = [
      "",
      "plain-text-password",
      "bcrypt$10$abc$def$ghi$jkl",
      "scrypt$1$1$1$a$b",
      `scrypt$1000$8$1$${salt}$AAAA`, // N is not a power of two
      `scrypt$1073741824$8$1$${salt}$AAAA`, // N far above the safety limit
      `scrypt$1024$8$999$${salt}$AAAA`, // p above the safety limit
      "scrypt$1024$8$1$$",
    ];
    for (const stored of malformed) {
      expect(await verifyPassword("pw-123456789", stored), stored).toBe(false);
    }
  });

  it("works at the real default cost (guards against the memory limit that rejects N=2^15 by default)", { timeout: 30_000 }, async () => {
    expect(DEFAULT_PARAMS).toEqual({ N: 32768, r: 8, p: 3 });
    const stored = await hashPassword("a-demo-password", DEFAULT_PARAMS);
    expect(stored.startsWith("scrypt$32768$8$3$")).toBe(true);
    expect(await verifyPassword("a-demo-password", stored)).toBe(true);
    expect(await verifyPassword("another-password", stored)).toBe(false);
  });
});