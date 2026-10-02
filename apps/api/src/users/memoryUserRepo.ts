import { normalizeEmail, type NewUser, type UserRecord, type UserRepo } from "./types";

/** In-memory adapter for tests. */
export class MemoryUserRepo implements UserRepo {
  private readonly byEmail = new Map<string, UserRecord>();
  private nextId = 1;

  async findByEmail(email: string): Promise<UserRecord | null> {
    const found = this.byEmail.get(normalizeEmail(email));
    return found ? { ...found } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    for (const user of this.byEmail.values()) {
      if (user.id === id) return { ...user };
    }
    return null;
  }

  async upsertByEmail(user: NewUser): Promise<{ created: boolean }> {
    const email = normalizeEmail(user.email);
    const existing = this.byEmail.get(email);
    if (existing) {
      this.byEmail.set(email, {
        ...existing,
        name: user.name,
        role: user.role,
        passwordHash: user.passwordHash,
        active: true,
      });
      return { created: false };
    }
    this.byEmail.set(email, {
      id: `user-${this.nextId++}`,
      name: user.name,
      email,
      role: user.role,
      passwordHash: user.passwordHash,
      active: true,
      lastLoginAt: null,
    });
    return { created: true };
  }

  async recordLogin(id: string, at: Date): Promise<void> {
    for (const [email, user] of this.byEmail) {
      if (user.id === id) this.byEmail.set(email, { ...user, lastLoginAt: at });
    }
  }

  async count(): Promise<number> {
    return this.byEmail.size;
  }

  /** Test helper: switch an account off or on. */
  setActive(email: string, active: boolean): void {
    const key = normalizeEmail(email);
    const user = this.byEmail.get(key);
    if (user) this.byEmail.set(key, { ...user, active });
  }
}