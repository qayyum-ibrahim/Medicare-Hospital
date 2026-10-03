import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { hasClientHeader, readCookie, refreshCookieOptions } from "../src/auth/cookies";

describe("readCookie", () => {
  it("finds the named cookie among others", () => {
    expect(readCookie("a=1; meridian_rt=abc; b=2", "meridian_rt")).toBe("abc");
  });

  it("returns null when the cookie or the header is missing", () => {
    expect(readCookie("a=1; b=2", "meridian_rt")).toBeNull();
    expect(readCookie(undefined, "meridian_rt")).toBeNull();
    expect(readCookie("", "meridian_rt")).toBeNull();
  });

  it("decodes encoded values and keeps equals signs inside the value", () => {
    expect(readCookie("meridian_rt=a%2Bb", "meridian_rt")).toBe("a+b");
    expect(readCookie("meridian_rt=abc=def", "meridian_rt")).toBe("abc=def");
  });

  it("does not match a cookie whose name merely ends the same way", () => {
    expect(readCookie("xmeridian_rt=bad; meridian_rt=good", "meridian_rt")).toBe("good");
  });

  it("returns null for a value that cannot be decoded", () => {
    expect(readCookie("meridian_rt=%E0%A4%A", "meridian_rt")).toBeNull();
  });
});

describe("refreshCookieOptions", () => {
  it("is hidden from page scripts, never sent cross-site, and limited to the auth routes", () => {
    expect(refreshCookieOptions(false)).toEqual({ httpOnly: true, secure: false, sameSite: "strict", path: "/auth" });
    expect(refreshCookieOptions(true).secure).toBe(true);
  });
});

describe("hasClientHeader", () => {
  const requestWith = (value: string | undefined) => ({ get: () => value }) as unknown as Request;

  it("accepts only the exact value the web app sends", () => {
    expect(hasClientHeader(requestWith("web"))).toBe(true);
    expect(hasClientHeader(requestWith("Web"))).toBe(false);
    expect(hasClientHeader(requestWith("other"))).toBe(false);
    expect(hasClientHeader(requestWith(undefined))).toBe(false);
  });
});