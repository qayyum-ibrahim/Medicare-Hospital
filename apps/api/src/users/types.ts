import type { Role } from "@meridian/shared";

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
  active: boolean;
  lastLoginAt: Date | null;
}

export interface NewUser {
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
}

/**
 * Storage port for users. The Mongo adapter is used by the running app; the in-memory
 * adapter is used by tests (docs/PHASE0_PLAN.md section 4).
 */
export interface UserRepo {
  findByEmail(email: string): Promise<UserRecord | null>;
  /** Creates the user, or updates name, role, password hash and active flag if the email exists. */
  upsertByEmail(user: NewUser): Promise<{ created: boolean }>;
  count(): Promise<number>;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}