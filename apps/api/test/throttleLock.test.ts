import { describe, expect, it } from "vitest";
import { LoginThrottle } from "../src/auth/throttle";

describe("LoginThrottle.recordFailure", () => {
  it("counts failures and flags only the one that starts the lockout", () => {
    const now = 1_000_000;
    const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 60_000, now: () => now });
    expect(throttle.recordFailure("k")).toEqual({ failures: 1, justLocked: false });
    expect(throttle.recordFailure("k")).toEqual({ failures: 2, justLocked: false });
    expect(throttle.recordFailure("k")).toEqual({ failures: 3, justLocked: true });
    expect(throttle.recordFailure("k")).toEqual({ failures: 4, justLocked: false });
  });

  it("starts counting again after the window passes", () => {
    let now = 1_000_000;
    const throttle = new LoginThrottle({ maxFailures: 2, windowMs: 60_000, now: () => now });
    throttle.recordFailure("k");
    expect(throttle.recordFailure("k").justLocked).toBe(true);
    now += 60_000;
    expect(throttle.recordFailure("k")).toEqual({ failures: 1, justLocked: false });
  });
});