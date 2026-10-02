import { describe, expect, it } from "vitest";
import { LoginThrottle } from "../src/auth/throttle";

function makeThrottle() {
  let now = 1_000_000;
  const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 60_000, now: () => now });
  return { throttle, advance: (ms: number) => (now += ms) };
}

describe("LoginThrottle", () => {
  it("allows attempts until the failure limit is reached", () => {
    const { throttle } = makeThrottle();
    for (let i = 0; i < 3; i++) {
      expect(throttle.check("k").allowed).toBe(true);
      throttle.recordFailure("k");
    }
    const blocked = throttle.check("k");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("counts down the wait and lets the key try again after the window", () => {
    const { throttle, advance } = makeThrottle();
    for (let i = 0; i < 3; i++) throttle.recordFailure("k");
    advance(45_000);
    expect(throttle.check("k")).toEqual({ allowed: false, retryAfterSeconds: 15 });
    advance(15_000);
    expect(throttle.check("k").allowed).toBe(true);
  });

  it("keeps different keys independent", () => {
    const { throttle } = makeThrottle();
    for (let i = 0; i < 3; i++) throttle.recordFailure("1.2.3.4|nurse@meridian.example");
    expect(throttle.check("1.2.3.4|nurse@meridian.example").allowed).toBe(false);
    expect(throttle.check("1.2.3.4|doctor@meridian.example").allowed).toBe(true);
    expect(throttle.check("5.6.7.8|nurse@meridian.example").allowed).toBe(true);
  });

  it("forgets earlier failures after a successful sign-in", () => {
    const { throttle } = makeThrottle();
    throttle.recordFailure("k");
    throttle.recordFailure("k");
    throttle.recordSuccess("k");
    throttle.recordFailure("k");
    throttle.recordFailure("k");
    expect(throttle.check("k").allowed).toBe(true);
  });
});