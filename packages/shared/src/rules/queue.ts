/**
 * Station queue rules (P6). The live board shows one bar per patient at a station with the
 * wait against that station's target. Targets below are ILLUSTRATIVE demo numbers,
 * not benchmarks (docs/ASSUMPTIONS.md E-002, E-004 to E-006). They will be a setting in the app.
 */

export const STATIONS = ["registration", "triage", "consult", "lab", "pharmacy", "billing"] as const;
export type Station = (typeof STATIONS)[number];
export type Destination = Station | "done";

export const PRIORITIES = ["urgent", "standard", "routine"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATION_LABELS: Record<Station, string> = {
  registration: "Registration",
  triage: "Triage",
  consult: "Consult",
  lab: "Lab",
  pharmacy: "Pharmacy",
  billing: "Billing",
};

export const DEFAULT_WAIT_TARGET_MINUTES: Record<Station, number> = {
  registration: 10,
  triage: 15,
  consult: 30,
  lab: 30,
  pharmacy: 15,
  billing: 10,
};

/** The moves that follow normal flow. Anything else is allowed but needs a reason and is flagged. */
export const EXPECTED_NEXT: Record<Station, readonly Destination[]> = {
  registration: ["triage", "consult"],
  triage: ["consult"],
  consult: ["lab", "pharmacy", "billing", "done"],
  lab: ["consult", "pharmacy", "billing"], // patients often return to the doctor after a lab test
  pharmacy: ["billing", "done"],
  billing: ["done"],
};

export interface TransitionCheck {
  allowed: boolean;
  /** True when the move follows normal flow. False means the caller must supply a reason. */
  expected: boolean;
  reason?: string;
}

export function evaluateTransition(from: Station | null, to: Destination): TransitionCheck {
  if (from === null) {
    if (to === "done") return { allowed: false, expected: false, reason: "The patient has not started a visit" };
    return { allowed: true, expected: to === "registration" };
  }
  if (from === to) return { allowed: false, expected: false, reason: "The patient is already at this station" };
  return { allowed: true, expected: EXPECTED_NEXT[from].includes(to) };
}

type TimeInput = Date | string;

function toMs(t: TimeInput): number {
  return t instanceof Date ? t.getTime() : new Date(t).getTime();
}

/** Whole minutes waited so far. Never negative, even if device clocks disagree slightly. */
export function waitMinutes(enteredAt: TimeInput, now: TimeInput): number {
  return Math.max(0, Math.floor((toMs(now) - toMs(enteredAt)) / 60000));
}

export type WaitStatus = "on_target" | "at_risk" | "breach";

/** at_risk starts at 80 percent of the target. breach is strictly over the target. */
export function waitStatus(minutes: number, targetMinutes: number): WaitStatus {
  if (minutes > targetMinutes) return "breach";
  if (minutes >= targetMinutes * 0.8) return "at_risk";
  return "on_target";
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, standard: 1, routine: 2 };

/** Urgent first, then standard, then routine; within a priority, longest waiting first. */
export function sortQueue<T extends { priority: Priority; enteredAt: TimeInput }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return toMs(a.enteredAt) - toMs(b.enteredAt);
  });
}

export interface StationSummary {
  station: Station;
  waiting: number;
  averageWaitMinutes: number;
  longestWaitMinutes: number;
  breaches: number;
  targetMinutes: number;
}

export function summarizeStations(
  entries: ReadonlyArray<{ station: Station; enteredAt: TimeInput }>,
  now: TimeInput,
  targets: Record<Station, number> = DEFAULT_WAIT_TARGET_MINUTES,
): StationSummary[] {
  return STATIONS.map((station) => {
    const waits = entries.filter((e) => e.station === station).map((e) => waitMinutes(e.enteredAt, now));
    const targetMinutes = targets[station];
    const total = waits.reduce((sum, w) => sum + w, 0);
    return {
      station,
      waiting: waits.length,
      averageWaitMinutes: waits.length === 0 ? 0 : Math.round(total / waits.length),
      longestWaitMinutes: waits.length === 0 ? 0 : Math.max(...waits),
      breaches: waits.filter((w) => waitStatus(w, targetMinutes) === "breach").length,
      targetMinutes,
    };
  });
}