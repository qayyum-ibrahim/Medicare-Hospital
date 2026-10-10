import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuditEntry } from "./types";

export const GENESIS_HASH = "0".repeat(64);

type Unhashed = Omit<AuditEntry, "hash">;

/** The exact text that gets hashed. Fixed field order and sorted detail keys, so it never varies. */
export function canonicalForm(entry: Unhashed): string {
  const detail = Object.fromEntries(
    Object.entries(entry.detail).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return JSON.stringify([
    entry.seq,
    entry.at.toISOString(),
    entry.actorId,
    entry.actorRole,
    entry.action,
    entry.outcome,
    entry.entityType,
    entry.entityId,
    entry.patientId,
    entry.reason,
    detail,
    entry.ip,
    entry.prevHash,
  ]);
}

export function computeHash(secret: string, entry: Unhashed): string {
  return createHmac("sha256", secret).update(canonicalForm(entry)).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type VerifyResult =
  | { ok: true; checked: number; head: { seq: number; hash: string } | null }
  | { ok: false; checked: number; firstBadSeq: number; problem: string };

/**
 * Walks the whole log from the start and checks every entry. It detects an altered entry, a
 * removed entry, reordered entries and a broken link. It cannot detect entries removed from the
 * very END of the log: note the head (sequence number and hash) somewhere outside the database
 * from time to time to catch that. See docs/ASSUMPTIONS.md I-003.
 */
export async function verifyChain(
  secret: string,
  readAfter: (afterSeq: number, limit: number) => Promise<AuditEntry[]>,
  pageSize = 500,
): Promise<VerifyResult> {
  let expectedSeq = 1;
  let previousHash = GENESIS_HASH;
  let checked = 0;

  for (;;) {
    const page = await readAfter(expectedSeq - 1, pageSize);
    if (page.length === 0) break;
    for (const entry of page) {
      const bad = (problem: string): VerifyResult => ({ ok: false, checked, firstBadSeq: expectedSeq, problem });
      if (entry.seq > expectedSeq) return bad("One or more entries are missing");
      if (entry.seq < expectedSeq) return bad("Entries are out of order or repeated");
      if (entry.prevHash !== previousHash) return bad("The link to the previous entry is broken");
      const { hash, ...unhashed } = entry;
      if (!sameHash(hash, computeHash(secret, unhashed))) return bad("This entry has been altered");
      previousHash = hash;
      expectedSeq++;
      checked++;
    }
  }
  return { ok: true, checked, head: checked === 0 ? null : { seq: expectedSeq - 1, hash: previousHash } };
}