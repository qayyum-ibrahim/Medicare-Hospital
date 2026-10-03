import type { NewSession, SessionMatch, SessionRecord, SessionRepo } from "./types";

/** In-memory adapter for tests. */
export class MemorySessionRepo implements SessionRepo {
  private readonly sessions: SessionRecord[] = [];
  private nextId = 1;

  async create(session: NewSession): Promise<SessionRecord> {
    const record: SessionRecord = { ...session, id: `session-${this.nextId++}` };
    this.sessions.push(record);
    return { ...record };
  }

  async findByHash(hash: string): Promise<SessionMatch | null> {
    for (const session of this.sessions) {
      if (session.currentHash === hash) return { session: { ...session }, matched: "current" };
      if (session.previousHash === hash) return { session: { ...session }, matched: "previous" };
    }
    return null;
  }

  async rotate(id: string, expectedCurrentHash: string, newHash: string, now: Date): Promise<boolean> {
    const session = this.sessions.find((s) => s.id === id);
    if (!session || session.revokedAt || session.currentHash !== expectedCurrentHash) return false;
    session.previousHash = expectedCurrentHash;
    session.currentHash = newHash;
    session.rotatedAt = now;
    session.lastUsedAt = now;
    return true;
  }

  async revoke(id: string, now: Date): Promise<void> {
    const session = this.sessions.find((s) => s.id === id);
    if (session && !session.revokedAt) session.revokedAt = now;
  }

  /** Test helper: a copy of everything stored. */
  all(): SessionRecord[] {
    return this.sessions.map((s) => ({ ...s }));
  }
}