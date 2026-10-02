import { describe, expect, it } from "vitest";
import {
  DEFAULT_WAIT_TARGET_MINUTES,
  evaluateTransition,
  sortQueue,
  summarizeStations,
  waitMinutes,
  waitStatus,
} from "../src/index";

describe("evaluateTransition", () => {
  it("starts a visit at registration", () => {
    expect(evaluateTransition(null, "registration")).toEqual({ allowed: true, expected: true });
  });

  it("allows other starting stations but marks them unexpected", () => {
    expect(evaluateTransition(null, "triage")).toEqual({ allowed: true, expected: false });
  });

  it("does not allow a visit to start as done", () => {
    expect(evaluateTransition(null, "done").allowed).toBe(false);
  });

  it("does not allow moving to the current station", () => {
    const r = evaluateTransition("triage", "triage");
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("The patient is already at this station");
  });

  it("follows normal flow", () => {
    expect(evaluateTransition("registration", "triage").expected).toBe(true);
    expect(evaluateTransition("triage", "consult").expected).toBe(true);
    expect(evaluateTransition("consult", "lab").expected).toBe(true);
    expect(evaluateTransition("lab", "consult").expected).toBe(true); // return to the doctor
    expect(evaluateTransition("consult", "pharmacy").expected).toBe(true);
    expect(evaluateTransition("pharmacy", "billing").expected).toBe(true);
    expect(evaluateTransition("billing", "done").expected).toBe(true);
  });

  it("allows but flags a jump outside normal flow", () => {
    expect(evaluateTransition("triage", "pharmacy")).toEqual({ allowed: true, expected: false });
    expect(evaluateTransition("billing", "consult")).toEqual({ allowed: true, expected: false });
  });
});

describe("waits", () => {
  const entered = new Date("2026-09-30T10:00:00Z");

  it("counts whole minutes and never goes negative", () => {
    expect(waitMinutes(entered, new Date("2026-09-30T10:14:59Z"))).toBe(14);
    expect(waitMinutes(entered, new Date("2026-09-30T09:59:00Z"))).toBe(0);
    expect(waitMinutes("2026-09-30T10:00:00Z", "2026-09-30T10:30:00Z")).toBe(30);
  });

  it("classifies against the target", () => {
    expect(waitStatus(11, 15)).toBe("on_target");
    expect(waitStatus(12, 15)).toBe("at_risk");
    expect(waitStatus(15, 15)).toBe("at_risk");
    expect(waitStatus(16, 15)).toBe("breach");
  });
});

describe("sortQueue", () => {
  it("puts urgent first, then longest waiting", () => {
    const entries = [
      { id: "a", priority: "routine" as const, enteredAt: "2026-09-30T08:00:00Z" },
      { id: "b", priority: "standard" as const, enteredAt: "2026-09-30T09:30:00Z" },
      { id: "c", priority: "urgent" as const, enteredAt: "2026-09-30T10:00:00Z" },
      { id: "d", priority: "standard" as const, enteredAt: "2026-09-30T09:00:00Z" },
    ];
    expect(sortQueue(entries).map((e) => e.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("does not change the array it was given", () => {
    const entries = [
      { priority: "routine" as const, enteredAt: "2026-09-30T08:00:00Z" },
      { priority: "urgent" as const, enteredAt: "2026-09-30T09:00:00Z" },
    ];
    const copy = [...entries];
    sortQueue(entries);
    expect(entries).toEqual(copy);
  });
});

describe("summarizeStations", () => {
  it("summarises waits and breaches per station", () => {
    const now = new Date("2026-09-30T10:30:00Z");
    const rows = summarizeStations(
      [
        { station: "triage", enteredAt: "2026-09-30T10:20:00Z" }, // 10 min, target 15
        { station: "triage", enteredAt: "2026-09-30T10:05:00Z" }, // 25 min, breach
        { station: "consult", enteredAt: "2026-09-30T10:20:00Z" }, // 10 min, target 30
      ],
      now,
    );
    expect(rows).toHaveLength(6);
    const triage = rows.find((r) => r.station === "triage");
    expect(triage).toMatchObject({ waiting: 2, averageWaitMinutes: 18, longestWaitMinutes: 25, breaches: 1, targetMinutes: 15 });
    const lab = rows.find((r) => r.station === "lab");
    expect(lab).toMatchObject({ waiting: 0, averageWaitMinutes: 0, breaches: 0 });
    expect(rows.find((r) => r.station === "consult")?.targetMinutes).toBe(DEFAULT_WAIT_TARGET_MINUTES.consult);
  });
});