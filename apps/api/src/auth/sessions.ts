/**
 * Sessions: a long random refresh token (kept in an httpOnly cookie) that can be exchanged for
 * new short-lived access tokens.
 *
 *  - Only the SHA-256 hash of the token is stored, never the token.
 *  - Every refresh replaces the token (rotation). Presenting the replaced token again after a
 *    short grace period is treated as theft and revokes the whole session.
 *  - A session ends after an idle period or an absolute lifetime, whichever comes first.
 *
 * The idle limit is measured between refreshes: the web app only refreshes while the person is
 * active. Defaults (15 minutes idle, 12 hours absolute) are illustrative: docs/ASSUMPTIONS.md I-005, I-012.
 */
import { createHash, randomBytes } from "node:crypto";
import type { SessionRepo } from "../sessions/types";

export type RotateFailure = "unknown" | "revoked" | "idle" | "absolute" | "reuse" | "retry";

export type RotateResult =
  | { ok: true; refreshToken: string; userId: string; sessionId: string; expiresAt: Date }
  | { ok: false; reason: RotateFailure; userId?: string; sessionId?: string };

export interface SessionService {
  start(userId: string): Promise<{ refreshToken: string; expiresAt: Date }>;
  rotate(presentedToken: string): Promise<RotateResult>;
  /** Ends the session the token belongs to. Does nothing if the token is unknown. */
  revoke(presentedToken: string): Promise<void>;
}

export interface SessionServiceOptions {
  repo: SessionRepo;
  idleMs: number;
  absoluteMs: number;
  /** Two refreshes racing from the same browser (two tabs) are not theft: allow this long. */
  graceMs?: number;
  now?: () => Date;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { repo, idleMs, absoluteMs } = options;
  const graceMs = options.graceMs ?? 10_000;
  const clock = options.now ?? (() => new Date());

  return {
    async start(userId) {
      const now = clock();
      const refreshToken = newRefreshToken();
      const expiresAt = new Date(now.getTime() + absoluteMs);
      await repo.create({
        userId,
        currentHash: hashToken(refreshToken),
        previousHash: null,
        rotatedAt: null,
        createdAt: now,
        lastUsedAt: now,
        expiresAt,
        revokedAt: null,
      });
      return { refreshToken, expiresAt };
    },

    async rotate(presentedToken) {
      const hash = hashToken(presentedToken);
      const found = await repo.findByHash(hash);
      if (!found) return { ok: false, reason: "unknown" };

      const { session, matched } = found;
      const now = clock();
      const ids = { userId: session.userId, sessionId: session.id };

      if (session.revokedAt) return { ok: false, reason: "revoked", ...ids };
      if (now.getTime() >= session.expiresAt.getTime()) return { ok: false, reason: "absolute", ...ids };

      if (matched === "previous") {
        const rotatedAt = session.rotatedAt?.getTime() ?? 0;
        if (now.getTime() - rotatedAt <= graceMs) return { ok: false, reason: "retry", ...ids };
        await repo.revoke(session.id, now);
        return { ok: false, reason: "reuse", ...ids };
      }

      if (now.getTime() - session.lastUsedAt.getTime() > idleMs) return { ok: false, reason: "idle", ...ids };

      const refreshToken = newRefreshToken();
      const rotated = await repo.rotate(session.id, hash, hashToken(refreshToken), now);
      if (!rotated) return { ok: false, reason: "retry", ...ids };
      return { ok: true, refreshToken, ...ids, expiresAt: session.expiresAt };
    },

    async revoke(presentedToken) {
      const found = await repo.findByHash(hashToken(presentedToken));
      if (found) await repo.revoke(found.session.id, clock());
    },
  };
}