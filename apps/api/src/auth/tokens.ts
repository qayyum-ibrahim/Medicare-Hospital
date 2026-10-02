/**
 * Short-lived access tokens (JWT, HS256). The token carries only the user id and role.
 *
 * Because the token is stateless, a changed role or a deactivated account is only noticed when
 * the token expires (15 minutes by default). Routes that need an instant answer look the user
 * up. Logged in docs/ASSUMPTIONS.md (I-010).
 */
import { isRole, type Role } from "@meridian/shared";
import { SignJWT, jwtVerify } from "jose";

export interface AuthContext {
  userId: string;
  role: Role;
}

export interface IssuedToken {
  token: string;
  expiresInSeconds: number;
}

export interface TokenService {
  signAccessToken(subject: AuthContext): Promise<IssuedToken>;
  /** Returns null for anything that is not a valid, unexpired token we issued. Never throws. */
  verifyAccessToken(token: string): Promise<AuthContext | null>;
}

const ISSUER = "meridian-care-api";
const AUDIENCE = "meridian-care-web";
export const MIN_SECRET_LENGTH = 32;

export function createTokenService(
  secret: string,
  options: { ttlSeconds?: number; now?: () => Date } = {},
): TokenService {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`The token secret must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  const key = new TextEncoder().encode(secret);
  const ttlSeconds = options.ttlSeconds ?? 15 * 60;
  const now = options.now ?? (() => new Date());

  return {
    async signAccessToken({ userId, role }) {
      const issuedAt = Math.floor(now().getTime() / 1000);
      const token = await new SignJWT({ role })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + ttlSeconds)
        .sign(key);
      return { token, expiresInSeconds: ttlSeconds };
    },

    async verifyAccessToken(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ["HS256"],
          currentDate: now(),
        });
        const role = payload["role"];
        if (typeof payload.sub !== "string" || !isRole(role)) return null;
        return { userId: payload.sub, role };
      } catch {
        return null;
      }
    },
  };
}