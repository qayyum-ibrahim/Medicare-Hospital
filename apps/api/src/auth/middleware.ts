import type { Request, RequestHandler, Response } from "express";
import type { AuthContext, TokenService } from "./tokens";

const AUTH_KEY = "auth";

/** Reads "Authorization: Bearer <token>" and returns the caller, or null if there is no valid token. */
export async function authenticateRequest(tokens: TokenService, req: Request): Promise<AuthContext | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
  return match?.[1] ? tokens.verifyAccessToken(match[1]) : null;
}

export function sendUnauthenticated(res: Response): void {
  res
    .set("WWW-Authenticate", "Bearer")
    .status(401)
    .json({ error: { code: "unauthenticated", message: "Please sign in" } });
}

export function setAuth(res: Response, context: AuthContext): void {
  res.locals[AUTH_KEY] = context;
}

/** Requires a valid bearer token. Puts the caller on res.locals. */
export function authenticate(tokens: TokenService): RequestHandler {
  return async (req, res, next) => {
    const context = await authenticateRequest(tokens, req);
    if (!context) {
      sendUnauthenticated(res);
      return;
    }
    setAuth(res, context);
    next();
  };
}

/** The signed-in caller. Only call this on routes that sit behind authenticate() or a role guard. */
export function getAuth(res: Response): AuthContext {
  const context = res.locals[AUTH_KEY] as AuthContext | undefined;
  if (!context) throw new Error("getAuth() was called on a route that is not behind authenticate()");
  return context;
}