import { isRole } from "@meridian/shared";
import { AuditModel } from "./auditModel";
import type { AuditDetail, AuditEntry, AuditQuery, AuditRepo } from "./types";

interface AuditDoc {
  seq: number;
  at: Date;
  actorId?: string | null;
  actorRole?: string | null;
  action: AuditEntry["action"];
  outcome: AuditEntry["outcome"];
  entityType?: string | null;
  entityId?: string | null;
  patientId?: string | null;
  reason?: string | null;
  detail?: unknown;
  ip?: string | null;
  prevHash: string;
  hash: string;
}

function toEntry(doc: AuditDoc): AuditEntry {
  return {
    seq: doc.seq,
    at: doc.at,
    actorId: doc.actorId ?? null,
    actorRole: isRole(doc.actorRole) ? doc.actorRole : null,
    action: doc.action,
    outcome: doc.outcome,
    entityType: doc.entityType ?? null,
    entityId: doc.entityId ?? null,
    patientId: doc.patientId ?? null,
    reason: doc.reason ?? null,
    detail: (doc.detail ?? {}) as AuditDetail,
    ip: doc.ip ?? null,
    prevHash: doc.prevHash,
    hash: doc.hash,
  };
}

/** MongoDB adapter. Append and read only: there is no update and no delete. */
export class MongoAuditRepo implements AuditRepo {
  async head(): Promise<{ seq: number; hash: string } | null> {
    const doc = await AuditModel.findOne().sort({ seq: -1 }).select("seq hash").lean();
    return doc ? { seq: doc.seq, hash: doc.hash } : null;
  }

  async append(entry: AuditEntry): Promise<"ok" | "conflict"> {
    try {
      await AuditModel.create(entry);
      return "ok";
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return "conflict";
      throw err;
    }
  }

  async list(query: AuditQuery): Promise<AuditEntry[]> {
    const filter: Record<string, unknown> = {};
    if (query.before !== undefined) filter["seq"] = { $lt: query.before };
    if (query.action) filter["action"] = query.action;
    if (query.outcome) filter["outcome"] = query.outcome;
    if (query.actorId) filter["actorId"] = query.actorId;
    if (query.patientId) filter["patientId"] = query.patientId;
    const docs = await AuditModel.find(filter).sort({ seq: -1 }).limit(query.limit).lean();
    return docs.map(toEntry);
  }

  async readAfter(afterSeq: number, limit: number): Promise<AuditEntry[]> {
    const docs = await AuditModel.find({ seq: { $gt: afterSeq } }).sort({ seq: 1 }).limit(limit).lean();
    return docs.map(toEntry);
  }
}