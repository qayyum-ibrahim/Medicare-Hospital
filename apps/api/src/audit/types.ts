import type { AuditAction, AuditOutcome, Role } from "@meridian/shared";

/** Small structured facts about an event. Never put names, phone numbers or clinical text here. */
export type AuditDetail = Record<string, string | number | boolean | null>;

export interface AuditEntry {
  /** 1, 2, 3, ... with no gaps. A gap means entries were removed. */
  seq: number;
  at: Date;
  actorId: string | null;
  actorRole: Role | null;
  action: AuditAction;
  outcome: AuditOutcome;
  entityType: string | null;
  entityId: string | null;
  patientId: string | null;
  /** The written reason, for break-glass access and overrides. */
  reason: string | null;
  detail: AuditDetail;
  ip: string | null;
  /** Keyed hash of the previous entry, so the entries form a chain. */
  prevHash: string;
  /** Keyed hash (HMAC) of everything above. */
  hash: string;
}

export interface NewAuditEvent {
  actor?: { userId: string; role: Role } | null;
  action: AuditAction;
  outcome?: AuditOutcome;
  entityType?: string;
  entityId?: string;
  patientId?: string;
  reason?: string;
  detail?: AuditDetail;
  ip?: string | null;
}

export interface AuditQuery {
  /** Only entries older than this sequence number (for paging). */
  before?: number;
  limit: number;
  action?: AuditAction;
  outcome?: AuditOutcome;
  actorId?: string;
  patientId?: string;
}

/**
 * Storage port for the audit log. There is deliberately no update and no delete: the log can
 * only grow. (This is application-level protection. See docs/ASSUMPTIONS.md I-003.)
 */
export interface AuditRepo {
  head(): Promise<{ seq: number; hash: string } | null>;
  /** Returns "conflict" if an entry with this sequence number already exists. */
  append(entry: AuditEntry): Promise<"ok" | "conflict">;
  /** Newest first. */
  list(query: AuditQuery): Promise<AuditEntry[]>;
  /** Entries with a sequence number above afterSeq, oldest first. Used to verify the chain. */
  readAfter(afterSeq: number, limit: number): Promise<AuditEntry[]>;
}