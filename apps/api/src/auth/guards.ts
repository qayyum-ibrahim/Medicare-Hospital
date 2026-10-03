import { canDo, canRead, readLevel, type Action, type ReadLevel, type Resource, type Role } from "@meridian/shared";
import type { RequestHandler, Response } from "express";
import { authenticateRequest, sendUnauthenticated, setAuth } from "./middleware";
import type { TokenService } from "./tokens";

const READ_LEVEL_KEY = "readLevel";

const forbidden = { error: { code: "forbidden", message: "You do not have access to this" } };

/**
 * Role-based route guards. Each guard checks sign-in itself, so a route can never be
 * protected by role while accidentally being open to anyone: no valid token gives 401, a
 * signed-in role without permission gives 403.
 *
 *   router.get("/x", guards.requireRead("auditLog"), handler);
 *   router.post("/y", guards.requireAction("claims", "write"), handler);
 *
 * The policy itself lives in @meridian/shared (one table, pinned by tests).
 */
export function createGuards(tokens: TokenService) {
  function guard(isAllowed: (role: Role) => boolean, levelFor: (role: Role) => ReadLevel): RequestHandler {
    return async (req, res, next) => {
      const context = await authenticateRequest(tokens, req);
      if (!context) {
        sendUnauthenticated(res);
        return;
      }
      if (!isAllowed(context.role)) {
        res.status(403).json(forbidden);
        return;
      }
      setAuth(res, context);
      res.locals[READ_LEVEL_KEY] = levelFor(context.role);
      next();
    };
  }

  return {
    /** The caller's role may read this resource. Handlers then call getReadLevel(res). */
    requireRead(resource: Resource): RequestHandler {
      return guard(
        (role) => canRead(role, resource),
        (role) => readLevel(role, resource),
      );
    },

    /** The caller's role may perform this action on this resource. */
    requireAction(resource: Resource, action: Action): RequestHandler {
      return guard(
        (role) => canDo(role, resource, action),
        (role) => readLevel(role, resource),
      );
    },
  };
}

/**
 * How much of the resource this caller may see: "full", "limited" (reduced fields) or
 * "masked" (identifiers hidden). Handlers use it to shape what they return.
 */
export function getReadLevel(res: Response): ReadLevel {
  const level = res.locals[READ_LEVEL_KEY] as ReadLevel | undefined;
  if (!level) throw new Error("getReadLevel() was called on a route that is not behind a role guard");
  return level;
}