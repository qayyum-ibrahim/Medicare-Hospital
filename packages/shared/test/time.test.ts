import { describe, expect, it } from "vitest";
import { formatWAT, formatWATTime, lagosDate } from "../src/index";

describe("WAT time helpers", () => {
  it("rolls to the next calendar day after 23:00 UTC (WAT is UTC+1)", () => {
    const d = new Date("2026-09-30T23:30:00Z");
    expect(lagosDate(d)).toBe("2026-10-01");
    expect(formatWAT(d)).toBe("1 Oct 2026, 00:30");
    expect(formatWATTime(d)).toBe("00:30");
  });

  it("stays on the same day just before the boundary", () => {
    const d = new Date("2026-09-30T22:59:00Z");
    expect(lagosDate(d)).toBe("2026-09-30");
    expect(formatWATTime(d)).toBe("23:59");
  });

  it("has no daylight saving shift", () => {
    expect(formatWATTime(new Date("2026-01-15T12:00:00Z"))).toBe("13:00");
    expect(formatWATTime(new Date("2026-07-15T12:00:00Z"))).toBe("13:00");
  });
});