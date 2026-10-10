import { afterEach, describe, expect, it, vi } from "vitest";
import { GENESIS_HASH } from "../src/audit/chain";
import { MemoryAuditRepo } from "../src/audit/memoryAuditRepo";
import { createAuditService } from "../src/audit/service";
import type { AuditEntry } from "../src/audit/types";
import { AUDIT_TEST_SECRET } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(repo = new MemoryAuditRepo()) {
  let tick = Date.parse("2026-10-03T08:00:00Z");
  const service = createAuditService({ repo, secret: AUDIT_TEST_SECRET, now: () => new Date((tick += 1000)) });
  return { repo, service };
}

describe("record", () => {
  it("numbers entries from 1 and links each to the one before", async () => {
    const { service } = setup();
    const first = await service.record({ action: "audit.view" });
    const second = await service.record({ action: "audit.verify" });
    const third = await service.record({ action: "audit.view" });
    expect([first.seq, second.seq, third.seq]).toEqual([1, 2, 3]);
    expect(first.prevHash).toBe(GENESIS_HASH);
    expect(second.prevHash).toBe(first.hash);
    expect(third.prevHash).toBe(second.hash);
  });

  it("fills in the actor and defaults", async () => {
    const { service } = setup();
    const entry = await service.record({
      actor: { userId: "user-5", role: "doctor" },
      action: "access.denied",
      outcome: "denied",
      entityType: "patient",
      entityId: "p-1",
      patientId: "p-1",
      reason: "checking",
      detail: { resource: "claims" },
      ip: "10.1.1.1",
    });
    expect(entry).toMatchObject({
      actorId: "user-5",
      actorRole: "doctor",
      outcome: "denied",
      entityType: "patient",
      patientId: "p-1",
      reason: "checking",
      ip: "10.1.1.1",
    });

    const bare = await service.record({ action: "audit.view" });
    expect(bare).toMatchObject({
      actorId: null,
      actorRole: null,
      outcome: "success",
      entityType: null,
      entityId: null,
      patientId: null,
      reason: null,
      ip: null,
      detail: {},
    });
  });

  it("keeps its own copy of the detail", async () => {
    const { service, repo } = setup();
    const detail = { returned: 1 };
    await service.record({ action: "audit.view", detail });
    detail.returned = 999;
    expect((await repo.list({ limit: 1 }))[0]?.detail).toEqual({ returned: 1 });
  });

  it("produces a valid chain even when many writes arrive at once", async () => {
    const { service } = setup();
    await Promise.all(Array.from({ length: 50 }, (_, i) => service.record({ action: "audit.view", detail: { i } })));
    const result = await service.verify();
    expect(result).toMatchObject({ ok: true, checked: 50 });
  });

  it("retries when another writer took the sequence number", async () => {
    class ConflictingRepo extends MemoryAuditRepo {
      attempts = 0;
      override async append(entry: AuditEntry): Promise<"ok" | "conflict"> {
        this.attempts++;
        if (this.attempts <= 2) return "conflict";
        return super.append(entry);
      }
    }
    const repo = new ConflictingRepo();
    const { service } = setup(repo);
    const entry = await service.record({ action: "audit.view" });
    expect(entry.seq).toBe(1);
    expect(repo.attempts).toBe(3);
  });

  it("gives up after several attempts and says so", async () => {
    class AlwaysConflict extends MemoryAuditRepo {
      override async append(): Promise<"ok" | "conflict"> {
        return "conflict";
      }
    }
    const { service } = setup(new AlwaysConflict());
    await expect(service.record({ action: "audit.view" })).rejects.toThrow("after several attempts");
  });

  it("keeps working after one write fails", async () => {
    class FailsOnce extends MemoryAuditRepo {
      failed = false;
      override async append(entry: AuditEntry): Promise<"ok" | "conflict"> {
        if (!this.failed) {
          this.failed = true;
          throw new Error("database hiccup");
        }
        return super.append(entry);
      }
    }
    const { service } = setup(new FailsOnce());
    await expect(service.record({ action: "audit.view" })).rejects.toThrow("database hiccup");
    expect((await service.record({ action: "audit.view" })).seq).toBe(1);
  });
});

describe("recordSafe", () => {
  it("never throws, and logs the failure without the event details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    class Broken extends MemoryAuditRepo {
      override async append(): Promise<"ok" | "conflict"> {
        throw new Error("database down");
      }
    }
    const { service } = setup(new Broken());
    await expect(service.recordSafe({ action: "audit.view", detail: { secret: "do-not-log" } })).resolves.toBeUndefined();
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("database down");
    expect(logged).not.toContain("do-not-log");
  });
});

describe("list and verify", () => {
  it("lists newest first, supports paging and filters", async () => {
    const { service } = setup();
    await service.record({ actor: { userId: "u1", role: "admin" }, action: "audit.view" });
    await service.record({ actor: { userId: "u2", role: "nurse" }, action: "access.denied", outcome: "denied", patientId: "p9" });
    await service.record({ actor: { userId: "u1", role: "admin" }, action: "audit.verify" });

    expect((await service.list({ limit: 10 })).map((e) => e.seq)).toEqual([3, 2, 1]);
    expect((await service.list({ limit: 1, before: 3 })).map((e) => e.seq)).toEqual([2]);
    expect((await service.list({ limit: 10, actorId: "u1" })).map((e) => e.seq)).toEqual([3, 1]);
    expect((await service.list({ limit: 10, outcome: "denied" })).map((e) => e.seq)).toEqual([2]);
    expect((await service.list({ limit: 10, patientId: "p9" })).map((e) => e.seq)).toEqual([2]);
    expect((await service.list({ limit: 10, action: "audit.verify" })).map((e) => e.seq)).toEqual([3]);
  });

  it("verifies the log it wrote", async () => {
    const { service } = setup();
    await service.record({ action: "audit.view" });
    await service.record({ action: "audit.view" });
    expect(await service.verify()).toMatchObject({ ok: true, checked: 2 });
  });

  it("refuses a secret that is too short", () => {
    expect(() => createAuditService({ repo: new MemoryAuditRepo(), secret: "short" })).toThrow(/at least 32 characters/);
  });
});