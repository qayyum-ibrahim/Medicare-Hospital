export interface SessionRecord {
  id: string;
  userId: string;
  /** SHA-256 of the refresh token currently in the browser's cookie. The token itself is never stored. */
  currentHash: string;
  /** Hash of the token this one replaced. Presenting it again later means it was copied. */
  previousHash: string | null;
  rotatedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date;
  /** Absolute end of the session, however active the user is. */
  expiresAt: Date;
  revokedAt: Date | null;
}

export type NewSession = Omit<SessionRecord, "id">;

export interface SessionMatch {
  session: SessionRecord;
  matched: "current" | "previous";
}

/** Storage port for sessions. Mongo adapter in the app, in-memory adapter in tests. */
export interface SessionRepo {
  create(session: NewSession): Promise<SessionRecord>;
  findByHash(hash: string): Promise<SessionMatch | null>;
  /**
   * Replaces the current hash, but only if it still equals expectedCurrentHash and the session
   * is not revoked. Returns false if someone else rotated first (a lost race).
   */
  rotate(id: string, expectedCurrentHash: string, newHash: string, now: Date): Promise<boolean>;
  revoke(id: string, now: Date): Promise<void>;
}