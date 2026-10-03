import { SessionModel } from "./sessionModel";
import type { NewSession, SessionMatch, SessionRecord, SessionRepo } from "./types";

interface SessionDoc {
  _id: unknown;
  userId: string;
  currentHash: string;
  previousHash?: string | null;
  rotatedAt?: Date | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
}

function toRecord(doc: SessionDoc): SessionRecord {
  return {
    id: String(doc._id),
    userId: doc.userId,
    currentHash: doc.currentHash,
    previousHash: doc.previousHash ?? null,
    rotatedAt: doc.rotatedAt ?? null,
    createdAt: doc.createdAt,
    lastUsedAt: doc.lastUsedAt,
    expiresAt: doc.expiresAt,
    revokedAt: doc.revokedAt ?? null,
  };
}

/** MongoDB adapter. Exercised by logging in, refreshing and logging out against your real database. */
export class MongoSessionRepo implements SessionRepo {
  async create(session: NewSession): Promise<SessionRecord> {
    const doc = await SessionModel.create({
      userId: session.userId,
      currentHash: session.currentHash,
      previousHash: session.previousHash,
      rotatedAt: session.rotatedAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    });
    return toRecord(doc.toObject());
  }

  async findByHash(hash: string): Promise<SessionMatch | null> {
    const doc = await SessionModel.findOne({ $or: [{ currentHash: hash }, { previousHash: hash }] }).lean();
    if (!doc) return null;
    return { session: toRecord(doc), matched: doc.currentHash === hash ? "current" : "previous" };
  }

  async rotate(id: string, expectedCurrentHash: string, newHash: string, now: Date): Promise<boolean> {
    const result = await SessionModel.updateOne(
      { _id: id, currentHash: expectedCurrentHash, revokedAt: null },
      { $set: { previousHash: expectedCurrentHash, currentHash: newHash, rotatedAt: now, lastUsedAt: now } },
    );
    return result.modifiedCount === 1;
  }

  async revoke(id: string, now: Date): Promise<void> {
    await SessionModel.updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt: now } });
  }
}