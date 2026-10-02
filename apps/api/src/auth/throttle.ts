/**
 * Limits repeated failed sign-ins for the same address and email (brute-force protection).
 *
 * Kept in memory, so it resets when the server restarts and only works for a single server
 * process. That is fine for this prototype and is logged in docs/ASSUMPTIONS.md (I-011).
 */
export interface ThrottleOptions {
  maxFailures: number;
  windowMs: number;
  now?: () => number;
}

interface Entry {
  failures: number;
  windowStart: number;
}

const MAX_TRACKED_KEYS = 10_000;

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;

  constructor(private readonly options: ThrottleOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const entry = this.live(key);
    if (!entry || entry.failures < this.options.maxFailures) return { allowed: true, retryAfterSeconds: 0 };
    const remainingMs = entry.windowStart + this.options.windowMs - this.now();
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }

  recordFailure(key: string): void {
    const entry = this.live(key);
    if (entry) entry.failures++;
    else this.entries.set(key, { failures: 1, windowStart: this.now() });
    this.prune();
  }

  recordSuccess(key: string): void {
    this.entries.delete(key);
  }

  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.windowStart >= this.options.windowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private prune(): void {
    if (this.entries.size <= MAX_TRACKED_KEYS) return;
    const cutoff = this.now() - this.options.windowMs;
    for (const [key, entry] of this.entries) {
      if (entry.windowStart <= cutoff) this.entries.delete(key);
    }
    // Still too many: drop the oldest entries (Map keeps insertion order).
    for (const key of this.entries.keys()) {
      if (this.entries.size <= MAX_TRACKED_KEYS) break;
      this.entries.delete(key);
    }
  }
}