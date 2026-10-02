import type { RequestHandler, Response } from "express";
import type { AuthContext, TokenService } from "./tokens";

const AUTH_KEY = "auth";

/** Requires a valid "Authorization: Bearer <token>" header. Puts the caller on res.locals. */
export function authenticate(tokens: TokenService): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "");
    const context = match?.[1] ? await tokens.verifyAccessToken(match[1]) : null;
    if (!context) {
      res
        .set("WWW-Authenticate", "Bearer")
        .status(401)
        .json({ error: { code: "unauthenticated", message: "Please sign in" } });
      return;
    }
    res.locals[AUTH_KEY] = context;
    next();
  };
}

/** The signed-in caller. Only call this on routes that sit behind authenticate(). */
export function getAuth(res: Response): AuthContext {
  const context = res.locals[AUTH_KEY] as AuthContext | undefined;
  if (!context) throw new Error("getAuth() was called on a route that is not behind authenticate()");
  return context;
}