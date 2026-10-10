import { describe, expect, it } from "vitest";
import { createSessionService } from "../src/auth/sessions";
import { MemorySessionRepo } from "../src/sessions/memorySessionRepo";

function setup() {
  const repo = new MemorySessionRepo();
  const service = createSessionService({ repo, idleMs: 15 * 60 * 1000, absoluteMs: 12 * 60 * 60 * 1000 });
  return { repo, service };
}

describe("revoke reports what it ended", () => {
  it("returns whose session ended, once, and null afterwards", async () => {
    const { repo, service } = setup();
    const { refreshToken } = await service.start("user-7");
    const sessionId = repo.all()[0]?.id;

    expect(await service.revoke(refreshToken)).toEqual({ userId: "user-7", sessionId });
    expect(await service.revoke(refreshToken)).toBeNull();
  });

  it("returns null for a token it does not know", async () => {
    const { service } = setup();
    expect(await service.revoke("nothing")).toBeNull();
  });
});