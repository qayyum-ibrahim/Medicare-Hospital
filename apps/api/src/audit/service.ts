import { GENESIS_HASH, computeHash, verifyChain, type VerifyResult } from "./chain";
import type { AuditEntry, AuditQuery, AuditRepo, NewAuditEvent } from "./types";

export interface AuditService {
  /**
   * Writes an entry. Throws if it cannot. Use this where an action must not happen without a
   * record (for example reading clinical data): the caller then fails the request.
   */
  record(event: NewAuditEvent): Promise<AuditEntry>;
  /** Writes an entry but never throws: a failure is logged. For events that must not be blocked by it. */
  recordSafe(event: NewAuditEvent): Promise<void>;
  list(query: AuditQuery): Promise<AuditEntry[]>;
  verify(): Promise<VerifyResult>;
}

export interface AuditServiceOptions {
  repo: AuditRepo;
  /** Secret for the keyed hash. Kept out of the database. */
  secret: string;
  now?: () => Date;
}

const MAX_ATTEMPTS = 10;
export const MIN_AUDIT_SECRET_LENGTH = 32;

export function createAuditService(options: AuditServiceOptions): AuditService {
  const { repo, secret } = options;
  if (secret.length < MIN_AUDIT_SECRET_LENGTH) {
    throw new Error(`The audit secret must be at least ${MIN_AUDIT_SECRET_LENGTH} characters`);
  }
  const clock = options.now ?? (() => new Date());

  async function write(event: NewAuditEvent): Promise<AuditEntry> {
    // Another server process could write at the same moment. If our sequence number is taken,
    // read the new end of the log and try again.
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const head = await repo.head();
      const unhashed = {
        seq: (head?.seq ?? 0) + 1,
        at: clock(),
        actorId: event.actor?.userId ?? null,
        actorRole: event.actor?.role ?? null,
        action: event.action,
        outcome: event.outcome ?? "success",
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        patientId: event.patientId ?? null,
        reason: event.reason ?? null,
        detail: { ...(event.detail ?? {}) },
        ip: event.ip ?? null,
        prevHash: head?.hash ?? GENESIS_HASH,
      };
      const entry: AuditEntry = { ...unhashed, hash: computeHash(secret, unhashed) };
      if ((await repo.append(entry)) === "ok") return entry;
    }
    throw new Error("Could not write the audit entry after several attempts");
  }

  // Writes from this process go one at a time, which avoids pointless clashes between them.
  let queue: Promise<unknown> = Promise.resolve();
  function record(event: NewAuditEvent): Promise<AuditEntry> {
    const run = queue.then(() => write(event));
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    record,

    async recordSafe(event) {
      try {
        await record(event);
      } catch (err) {
        console.error("Audit log write failed:", err instanceof Error ? err.message : String(err));
      }
    },

    list: (query) => repo.list(query),

    verify: () => verifyChain(secret, (afterSeq, limit) => repo.readAfter(afterSeq, limit)),
  };
}