export const ROLES = [
  "front_desk",
  "nurse",
  "doctor",
  "pharmacist",
  "lab",
  "billing",
  "admin",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  front_desk: "Front desk",
  nurse: "Nurse",
  doctor: "Doctor",
  pharmacist: "Pharmacist",
  lab: "Lab",
  billing: "Billing and finance",
  admin: "Admin / owner",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}