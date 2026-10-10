import { describe, expect, it } from "vitest";
import { GENESIS_HASH, canonicalForm, computeHash, verifyChain } from "../src/audit/chain";
import { MemoryAuditRepo } from "../src/audit/memoryAuditRepo";
import { createAuditService } from "../src/audit/service";
import type { AuditEntry } from "../src/audit/types";
import { AUDIT_TEST_SECRET } from "./helpers";

const SECRET = AUDIT_TEST_SECRET;

async function buildLog(count: number) {
  const repo = new MemoryAuditRepo();
  let tick = Date.parse("2026-10-03T08:00:00Z");
  const service = createAuditService({ repo, secret: SECRET, now: () => new Date((tick += 1000)) });
  for (let i = 1; i <= count; i++) {
    await service.record({
      actor: { userId: "user-1", role: "admin" },
      action: "audit.view",
      detail: { returned: i },
      ip: "127.0.0.1",
    });
  }
  const verify = (pageSize?: number) =>
    verifyChain(SECRET, (after, limit) => repo.readAfter(after, limit), pageSize);
  return { repo, service, verify };
}

const baseEntry: Omit<AuditEntry, "hash"> = {
  seq: 1,
  at: new Date("2026-10-03T08:00:00.000Z"),
  actorId: "user-1",
  actorRole: "admin",
  action: "audit.view",
  outcome: "success",
  entityType: "user",
  entityId: "user-2",
  patientId: "patient-1",
  reason: "because",
  detail: { a: 1, b: "x" },
  ip: "10.0.0.1",
  prevHash: GENESIS_HASH,
};

describe("computeHash", () => {
  it("is a 64 character hex string and is stable", () => {
    const hash = computeHash(SECRET, baseEntry);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeHash(SECRET, baseEntry)).toBe(hash);
  });

  it("does not depend on the order of the detail keys", () => {
    const reordered = { ...baseEntry, detail: { b: "x", a: 1 } };
    expect(canonicalForm(reordered)).toBe(canonicalForm(baseEntry));
    expect(computeHash(SECRET, reordered)).toBe(computeHash(SECRET, baseEntry));
  });

  it("changes when any single field changes", () => {
    const original = computeHash(SECRET, baseEntry);
    const changes: Array<Partial<Omit<AuditEntry, "hash">>> = [
      { seq: 2 },
      { at: new Date("2026-10-03T08:00:00.001Z") },
      { actorId: "user-9" },
      { actorRole: "nurse" },
      { action: "audit.verify" },
      { outcome: "denied" },
      { entityType: "patient" },
      { entityId: "user-3" },
      { patientId: "patient-2" },
      { reason: "other" },
      { detail: { a: 2, b: "x" } },
      { detail: { a: 1, b: "x", c: true } },
      { ip: "10.0.0.2" },
      { prevHash: "1".repeat(64) },
    ];
    for (const change of changes) {
      expect(computeHash(SECRET, { ...baseEntry, ...change }), JSON.stringify(change)).not.toBe(original);
    }
  });

  it("changes with the secret", () => {
    expect(computeHash("another-secret-another-secret-12345", baseEntry)).not.toBe(computeHash(SECRET, baseEntry));
  });
});

describe("verifyChain", () => {
  it("accepts an empty log", async () => {
    const { verify } = await buildLog(0);
    expect(await verify()).toEqual({ ok: true, checked: 0, head: null });
  });

  it("accepts an untouched log and reports the head", async () => {
    const { repo, verify } = await buildLog(5);
    const result = await verify();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.checked).toBe(5);
    expect(result.head).toEqual(await repo.head());
  });

  it("works across page boundaries", async () => {
    const { verify } = await buildLog(7);
    const result = await verify(2);
    expect(result).toMatchObject({ ok: true, checked: 7 });
  });

  it("detects an altered field and says which entry", async () => {
    const { repo, verify } = await buildLog(5);
    repo.tamper(3, { outcome: "failure" });
    expect(await verify()).toEqual({ ok: false, checked: 2, firstBadSeq: 3, problem: "This entry has been altered" });
  });

  it("detects altered detail, an altered hash and a renumbered entry", async () => {
    const detail = await buildLog(4);
    detail.repo.tamper(2, { detail: { returned: 999 } });
    expect(await detail.verify()).toMatchObject({ ok: false, firstBadSeq: 2 });

    const hash = await buildLog(4);
    hash.repo.tamper(4, { hash: "a".repeat(64) });
    expect(await hash.verify()).toMatchObject({ ok: false, firstBadSeq: 4, problem: "This entry has been altered" });

    const renumbered = await buildLog(4);
    renumbered.repo.tamper(3, { seq: 9 });
    expect(await renumbered.verify()).toMatchObject({ ok: false, firstBadSeq: 3 });
  });

  it("detects an entry removed from the middle", async () => {
    const { repo, verify } = await buildLog(5);
    repo.remove(3);
    expect(await verify()).toEqual({ ok: false, checked: 2, firstBadSeq: 3, problem: "One or more entries are missing" });
  });

  it("detects a tamperer who rewrites an entry and recomputes its hash without knowing the secret", async () => {
    const { repo, verify } = await buildLog(4);
    const forged = { ...baseEntry, seq: 2, detail: { returned: 999 } };
    repo.tamper(2, { detail: { returned: 999 }, hash: computeHash("guessed-secret-guessed-secret-12345", forged) });
    expect(await verify()).toMatchObject({ ok: false, firstBadSeq: 2, problem: "This entry has been altered" });
  });

  it("detects a rewritten entry even if its own hash is fixed, because the next link breaks", async () => {
    const { repo, verify } = await buildLog(4);
    const original = (await repo.readAfter(1, 1))[0];
    if (!original) throw new Error("setup failed");
    const { hash: _old, ...rest } = original;
    const rewritten = { ...rest, detail: { returned: 999 } };
    repo.tamper(2, { detail: { returned: 999 }, hash: computeHash(SECRET, rewritten) });
    expect(await verify()).toMatchObject({ ok: false, firstBadSeq: 3, problem: "The link to the previous entry is broken" });
  });

  it("fails everything when checked with the wrong secret", async () => {
    const { repo } = await buildLog(3);
    const result = await verifyChain("wrong-secret-wrong-secret-wrong-12345", (a, l) => repo.readAfter(a, l));
    expect(result).toMatchObject({ ok: false, firstBadSeq: 1 });
  });

  it("documents a known limit: entries removed from the very end are not noticed, but the head shows it", async () => {
    const { repo, verify } = await buildLog(5);
    repo.remove(5);
    const result = await verify();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.head?.seq).toBe(4);
  });
});
