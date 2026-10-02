/**
 * Times are stored in UTC and shown in Africa/Lagos (WAT, UTC+1, no daylight saving).
 * Output is assembled by hand so it does not depend on the browser or Node locale data.
 */

const TZ = "Africa/Lagos";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

interface LagosParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function lagosParts(date: Date): LagosParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return {
    year: out["year"] ?? "",
    month: out["month"] ?? "",
    day: out["day"] ?? "",
    hour: out["hour"] ?? "",
    minute: out["minute"] ?? "",
  };
}

/** The calendar date in Lagos, as YYYY-MM-DD. Used for bed-day posting and day boundaries. */
export function lagosDate(date: Date): string {
  const p = lagosParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "30 Sep 2026, 14:05" in WAT. */
export function formatWAT(date: Date): string {
  const p = lagosParts(date);
  const monthName = MONTHS[Number(p.month) - 1] ?? p.month;
  return `${Number(p.day)} ${monthName} ${p.year}, ${p.hour}:${p.minute}`;
}

/** "14:05" in WAT. */
export function formatWATTime(date: Date): string {
  const p = lagosParts(date);
  return `${p.hour}:${p.minute}`;
}