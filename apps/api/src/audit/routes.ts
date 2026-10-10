import { AUDIT_ACTIONS, AUDIT_OUTCOMES } from "@meridian/shared";
import { Router } from "express";
import { z } from "zod";
import { createGuards } from "../auth/guards";
import { getAuth } from "../auth/middleware";
import type { TokenService } from "../auth/tokens";
import type { AuditEntry } from "./types";
import type { AuditService } from "../audit/service";

export interface AuditRouterDeps {
  tokens: TokenService;
  audit: AuditService;
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().min(1).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  outcome: z.enum(AUDIT_OUTCOMES).optional(),
  actorId: z.string().min(1).max(100).optional(),
  patientId: z.string().min(1).max(100).optional(),
});

function toApi(entry: AuditEntry) {
  return {
    seq: entry.seq,
    at: entry.at.toISOString(),
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    outcome: entry.outcome,
    entityType: entry.entityType,
    entityId: entry.entityId,
    patientId: entry.patientId,
    reason: entry.reason,
    detail: entry.detail,
    ip: entry.ip,
    hash: entry.hash,
  };
}

/**
 * Admin-only views of the audit log. Looking at the log is itself recorded, and if that record
 * cannot be written the request fails: nobody reads the log without leaving a trace.
 */
export function createAuditRouter(deps: AuditRouterDeps): Router {
  const router = Router();
  const guards = createGuards(deps.tokens);

  router.get("/", guards.requireRead("auditLog"), async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "validation_error",
          message: "Check the filters",
          fields: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
        },
      });
      return;
    }
    const { limit, ...filters } = parsed.data;

    const rows = await deps.audit.list({ ...filters, limit: limit + 1 });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextBefore = rows.length > limit && last ? last.seq : null;

    await deps.audit.record({
      actor: getAuth(res),
      action: "audit.view",
      detail: { returned: page.length },
      ip: req.ip ?? null,
    });
    res.set("Cache-Control", "no-store").json({ entries: page.map(toApi), nextBefore });
  });

  router.get("/verify", guards.requireRead("auditLog"), async (req, res) => {
    const result = await deps.audit.verify();
    await deps.audit.record({
      actor: getAuth(res),
      action: "audit.verify",
      outcome: result.ok ? "success" : "failure",
      detail: { checked: result.checked, ok: result.ok },
      ip: req.ip ?? null,
    });
    res.set("Cache-Control", "no-store").json(result);
  });

  return router;
}