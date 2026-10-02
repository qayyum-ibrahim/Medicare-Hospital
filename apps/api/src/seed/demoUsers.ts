import type { Role } from "@meridian/shared";
import { DEFAULT_PARAMS, hashPassword, type ScryptParams } from "../auth/password";
import type { UserRepo } from "../users/types";

export interface DemoUser {
  name: string;
  email: string;
  role: Role;
}

/**
 * Fictional staff for the fictional Meridian Care Hospital. The .example domain is reserved
 * for documentation, so these addresses can never belong to a real person.
 */
export const DEMO_USERS: readonly DemoUser[] = [
  { name: "Adaeze Okonkwo", email: "frontdesk@meridian.example", role: "front_desk" },
  { name: "Funmilayo Adebayo", email: "nurse@meridian.example", role: "nurse" },
  { name: "Dr. Ibrahim Musa", email: "doctor@meridian.example", role: "doctor" },
  { name: "Chinedu Eze", email: "pharmacist@meridian.example", role: "pharmacist" },
  { name: "Hauwa Bello", email: "lab@meridian.example", role: "lab" },
  { name: "Tunde Balogun", email: "billing@meridian.example", role: "billing" },
  { name: "Ngozi Adeleke", email: "admin@meridian.example", role: "admin" },
];

export interface SeedResult {
  created: number;
  updated: number;
  users: readonly DemoUser[];
}

/** Safe to run repeatedly: existing demo users are updated, not duplicated. */
export async function seedDemoUsers(
  repo: UserRepo,
  password: string,
  params: ScryptParams = DEFAULT_PARAMS,
): Promise<SeedResult> {
  let created = 0;
  let updated = 0;
  for (const user of DEMO_USERS) {
    const passwordHash = await hashPassword(password, params);
    const result = await repo.upsertByEmail({ ...user, passwordHash });
    if (result.created) created++;
    else updated++;
  }
  return { created, updated, users: DEMO_USERS };
}