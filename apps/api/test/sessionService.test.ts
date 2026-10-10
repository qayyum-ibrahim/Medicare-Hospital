import { describe, expect, it } from "vitest";
import { createSessionService, hashToken } from "../src/auth/sessions";
import { MemorySessionRepo } from "../src/sessions/memorySessionRepo";

const IDLE = 15 * 60 * 1000;
const ABSOLUTE = 12 * 60 * 60 * 1000;
const GRACE = 10_000;
const MINUTE = 60 * 1000;

function setup(repo = new MemorySessionRepo()) {
  let now = new Date("2026-10-02T09:00:00Z");
  const service = createSessionService({ repo, idleMs: IDLE, absoluteMs: ABSOLUTE, graceMs: GRACE, now: () => now });
  return { repo, service, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe("start", () => {
  it("returns a long random token with the absolute expiry, and stores only its hash", async () => {
    const { repo, service } = setup();
    const { refreshToken, expiresAt } = await service.start("user-1");
    expect(refreshToken.length).toBeGreaterThanOrEqual(43);
    expect(expiresAt.toISOString()).toBe("2026-10-02T21:00:00.000Z");

    const stored = repo.all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.currentHash).toBe(hashToken(refreshToken));
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
  });

  it("never issues the same token twice", async () => {
    const { service } = setup();
    const a = await service.start("user-1");
    const b = await service.start("user-1");
    expect(a.refreshToken).not.toBe(b.refreshToken);
  });
});

describe("rotate", () => {
  it("swaps the token for a new one and keeps the same session", async () => {
    const { service } = setup();
    const { refreshToken } = await service.start("user-1");
    const result = await service.rotate(refreshToken);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.refreshToken).not.toBe(refreshToken);
    expect(result.userId).toBe("user-1");
    expect((await service.rotate(result.refreshToken)).ok).toBe(true);
  });

  it("keeps a session alive while the person stays active", async () => {
    const { service, advance } = setup();
    let token = (await service.start("user-1")).refreshToken;
    for (let i = 0; i < 30; i++) {
      advance(10 * MINUTE);
      const result = await service.rotate(token);
      expect(result.ok, `refresh ${i + 1}`).toBe(true);
      if (result.ok) token = result.refreshToken;
    }
  });

  it("refuses after the idle limit", async () => {
    const { service, advance } = setup();
    const { refreshToken } = await service.start("user-1");
    advance(IDLE + 1000);
    expect(await service.rotate(refreshToken)).toMatchObject({ ok: false, reason: "idle" });
  });

  it("still accepts exactly at the idle limit", async () => {
    const { service, advance } = setup();
    const { refreshToken } = await service.start("user-1");
    advance(IDLE);
    expect((await service.rotate(refreshToken)).ok).toBe(true);
  });

  it("ends the session at the absolute limit even for someone who never goes idle", async () => {
    const { service, advance } = setup();
    let token = (await service.start("user-1")).refreshToken;
    let successes = 0;
    for (let i = 0; i < 72; i++) {
      advance(10 * MINUTE);
      const result = await service.rotate(token);
      if (!result.ok) {
        expect(result.reason).toBe("absolute");
        break;
      }
      token = result.refreshToken;
      successes++;
    }
    expect(successes).toBe(71);
  });

  it("refuses a token it has never seen", async () => {
    const { service } = setup();
    expect(await service.rotate("not-a-real-token")).toEqual({ ok: false, reason: "unknown" });
  });

  it("refuses a revoked session", async () => {
    const { service } = setup();
    const { refreshToken } = await service.start("user-1");
    await service.revoke(refreshToken);
    expect(await service.rotate(refreshToken)).toMatchObject({ ok: false, reason: "revoked" });
  });
});

describe("reuse of a replaced token", () => {
  it("revokes the whole session when a replaced token comes back after the grace period", async () => {
    const { service, advance } = setup();
    const first = (await service.start("user-1")).refreshToken;
    const rotated = await service.rotate(first);
    if (!rotated.ok) throw new Error("setup failed");

    advance(GRACE + 1000);
    expect(await service.rotate(first)).toMatchObject({ ok: false, reason: "reuse", userId: "user-1" });
    expect(await service.rotate(rotated.refreshToken)).toMatchObject({ ok: false, reason: "revoked" });
  });

  it("treats a quick repeat as a harmless race, not theft", async () => {
    const { service, advance } = setup();
    const first = (await service.start("user-1")).refreshToken;
    const rotated = await service.rotate(first);
    if (!rotated.ok) throw new Error("setup failed");

    advance(5000);
    expect(await service.rotate(first)).toMatchObject({ ok: false, reason: "retry" });
    expect((await service.rotate(rotated.refreshToken)).ok).toBe(true);
  });

  it("reports a lost race as retry when someone else rotated between the check and the swap", async () => {
    class LosingRepo extends MemorySessionRepo {
      override async rotate(): Promise<boolean> {
        return false;
      }
    }
    const { service } = setup(new LosingRepo());
    const { refreshToken } = await service.start("user-1");
    expect(await service.rotate(refreshToken)).toMatchObject({ ok: false, reason: "retry" });
  });
});

describe("revoke", () => {
  it("also works with the replaced token", async () => {
    const { service } = setup();
    const first = (await service.start("user-1")).refreshToken;
    const rotated = await service.rotate(first);
    if (!rotated.ok) throw new Error("setup failed");
    await service.revoke(first);
    expect(await service.rotate(rotated.refreshToken)).toMatchObject({ ok: false, reason: "revoked" });
  });

  it("ignores a token it does not know", async () => {
    const { service } = setup();
    await expect(service.revoke("nothing")).resolves.toBeNull();  });
});