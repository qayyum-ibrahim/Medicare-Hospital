/**
 * Password hashing with scrypt from Node's built-in crypto module (no native add-ons to install).
 *
 * Stored format (self-describing, so the cost can be raised later without breaking old hashes):
 *   scrypt$N$r$p$salt(base64)$hash(base64)
 *
 * Default cost is N=2^15, r=8, p=3. As far as I remember, that matches one of the equivalent
 * scrypt settings in the OWASP password storage guidance. Verify against the current OWASP
 * cheat sheet before any real use (docs/ASSUMPTIONS.md I-009).
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 3 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

// Sanity limits so a corrupted stored hash can never make us allocate huge amounts of memory.
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  // Node's default memory limit (32 MiB) is too small for N=2^15, so set it explicitly.
  const options: ScryptOptions = { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r };
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, KEY_LENGTH, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
  if (password.length === 0) throw new Error("Password cannot be empty");
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), key.toString("base64")].join("$");
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;
}

/** Returns false (never throws) for a wrong password or for a malformed stored hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nText, rText, pText, saltText, hashText] = parts;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!isPowerOfTwo(N) || N > MAX_N) return false;
  if (!Number.isInteger(r) || r < 1 || r > MAX_R) return false;
  if (!Number.isInteger(p) || p < 1 || p > MAX_P) return false;

  const salt = Buffer.from(saltText ?? "", "base64");
  const expected = Buffer.from(hashText ?? "", "base64");
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  try {
    const actual = await derive(password, salt, { N, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}