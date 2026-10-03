import { POLICY, RESOURCES, type Action, type ReadLevel, type Resource } from "@meridian/shared";
import { Router } from "express";
import { authenticate, getAuth } from "./middleware";
import type { TokenService } from "./tokens";

export type PermissionMap = Record<Resource, { read: ReadLevel; actions: Action[] }>;

/**
 * GET /auth/permissions: what the signed-in role may see and do. The web app uses it to show
 * each role only what it needs. This is for display only: the server enforces access on every
 * route regardless of what the web app shows.
 */
export function createPermissionsRouter(tokens: TokenService): Router {
  const router = Router();

  router.get("/permissions", authenticate(tokens), (_req, res) => {
    const { role } = getAuth(res);
    const permissions = Object.fromEntries(
      RESOURCES.map((resource) => [
        resource,
        { read: POLICY[resource][role].read, actions: [...POLICY[resource][role].actions] },
      ]),
    ) as PermissionMap;
    res.set("Cache-Control", "no-store").json({ role, permissions });
  });

  return router;
}