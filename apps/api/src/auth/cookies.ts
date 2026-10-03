import type { CookieOptions, Request } from "express";

export const REFRESH_COOKIE = "meridian_rt";

/**
 * The web app sends this header on refresh and logout. A page on another website cannot add a
 * custom header without the browser asking our permission first (CORS), so this blocks
 * cross-site request forgery on top of the SameSite=Strict cookie.
 */
export const CLIENT_HEADER = "x-meridian-client";

export function hasClientHeader(req: Request): boolean {
  return req.get(CLIENT_HEADER) === "web";
}

/** Reads one cookie from a Cookie header. Returns null if it is missing. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/** Not readable by page scripts, never sent from another site, only sent to /auth routes. */
export function refreshCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: "strict", path: "/auth" };
}