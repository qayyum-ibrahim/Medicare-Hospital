import type { AuditEntry, AuditQuery, AuditRepo } from "./types";

function copy(entry: AuditEntry): AuditEntry {
  return { ...entry, at: new Date(entry.at), detail: { ...entry.detail } };
}

/** In-memory adapter for tests. */
export class MemoryAuditRepo implements AuditRepo {
  private entries: AuditEntry[] = [];

  async head(): Promise<{ seq: number; hash: string } | null> {
    const last = this.entries[this.entries.length - 1];
    return last ? { seq: last.seq, hash: last.hash } : null;
  }

  async append(entry: AuditEntry): Promise<"ok" | "conflict"> {
    const last = this.entries[this.entries.length - 1];
    if (entry.seq !== (last?.seq ?? 0) + 1) return "conflict";
    this.entries.push(copy(entry));
    return "ok";
  }

  async list(query: AuditQuery): Promise<AuditEntry[]> {
    return this.entries
      .filter((e) => query.before === undefined || e.seq < query.before)
      .filter((e) => !query.action || e.action === query.action)
      .filter((e) => !query.outcome || e.outcome === query.outcome)
      .filter((e) => !query.actorId || e.actorId === query.actorId)
      .filter((e) => !query.patientId || e.patientId === query.patientId)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, query.limit)
      .map(copy);
  }

  async readAfter(afterSeq: number, limit: number): Promise<AuditEntry[]> {
    return this.entries
      .filter((e) => e.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map(copy);
  }

  /** Test helper: change a stored entry behind the service's back, as an attacker with database access could. */
  tamper(seq: number, patch: Partial<AuditEntry>): void {
    const index = this.entries.findIndex((e) => e.seq === seq);
    const current = this.entries[index];
    if (index !== -1 && current) this.entries[index] = { ...current, ...patch };
  }

  /** Test helper: remove an entry behind the service's back. */
  remove(seq: number): void {
    this.entries = this.entries.filter((e) => e.seq !== seq);
  }
}