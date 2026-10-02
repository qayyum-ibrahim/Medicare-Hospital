import { normalizeEmail, type NewUser, type UserRecord, type UserRepo } from "./types";

/** In-memory adapter for tests. */
export class MemoryUserRepo implements UserRepo {
  private readonly byEmail = new Map<string, UserRecord>();
  private nextId = 1;

  async findByEmail(email: string): Promise<UserRecord | null> {
    const found = this.byEmail.get(normalizeEmail(email));
    return found ? { ...found } : null;
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

  async count(): Promise<number> {
    return this.byEmail.size;
  }
}