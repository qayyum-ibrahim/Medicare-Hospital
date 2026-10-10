/**
 * Things the audit log records. More are added as features arrive (patient views, break-glass
 * access, price overrides, and so on). Names are "area.event".
 */
export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.login_failed",
  "auth.login_throttled",
  "auth.logout",
  "auth.refresh_reuse",
  "access.denied",
  "audit.view",
  "audit.verify",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_OUTCOMES = ["success", "failure", "denied"] as const;

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
