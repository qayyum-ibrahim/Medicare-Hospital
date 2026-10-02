/**
 * Fuzzy duplicate detection (P5): name + date of birth + phone.
 *
 * All weights and thresholds are illustrative and tunable (docs/ASSUMPTIONS.md D-004, D-005,
 * D-010, D-011).
 * Design choices that matter for Nigerian records:
 *  - Name order varies ("Adeyemi Olamide" / "Olamide Adeyemi"), so names are compared as
 *    token sets, not as one string.
 *  - Tonal marks and dots (for example in Yoruba names) are stripped before comparing.
 *  - Family members often share one phone number, so a shared phone is weak evidence and
 *    a phone match on its own can never flag a duplicate.
 *  - Twins and siblings can share surname, birth date and phone, so that combination is
 *    capped at "possible" for a human to review.
 */

export interface PhoneEntry {
  number: string; // E.164, for example +2348031234567
  isShared?: boolean;
}

export interface PatientIdentity {
  firstName: string;
  middleName?: string;
  lastName: string;
  dob: string; // YYYY-MM-DD
  phones: readonly PhoneEntry[];
}

export type MatchLevel = "likely" | "possible" | "none";

export interface DuplicateMatch {
  level: MatchLevel;
  score: number; // 0 to 1, three decimals
  nameScore: number;
  dobScore: number;
  phoneScore: number;
  reasons: string[]; // plain English, shown to front desk staff
}

export const WEIGHTS = { name: 0.5, dob: 0.35, phone: 0.15 } as const;
export const THRESHOLDS = { likely: 0.85, possible: 0.65 } as const;
const SHARED_PHONE_SCORE = 0.4;

/** A very small curated list of common spelling variants. Extend with hospital data. */
const NAME_ALIASES: Record<string, string> = {
  mohammed: "muhammad",
  mohammad: "muhammad",
  mohamed: "muhammad",
  muhammed: "muhammad",
  mohamad: "muhammad",
  ibraheem: "ibrahim",
};

export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(p: PatientIdentity): string[] {
  const all = [p.firstName, p.middleName ?? "", p.lastName]
    .flatMap((part) => normalizeName(part).split(" "))
    .filter((t) => t.length > 0);
  return all.map((t) => NAME_ALIASES[t] ?? t);
}

export function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatched[i]) continue;
    while (!bMatched[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
}

export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  if (j < 0.7) return j;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return j + prefix * 0.1 * (1 - j);
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) {
    // An initial ("O") against a full name ("Olamide")
    const short = a.length <= b.length ? a : b;
    const long = a.length <= b.length ? b : a;
    return long.startsWith(short) ? 0.9 : 0;
  }
  return jaroWinkler(a, b);
}

function directional(from: readonly string[], to: readonly string[]): number {
  if (from.length === 0) return 0;
  let sum = 0;
  for (const t of from) {
    let best = 0;
    for (const u of to) best = Math.max(best, tokenSimilarity(t, u));
    sum += best;
  }
  return sum / from.length;
}

/** 0 to 1, insensitive to name order, tone marks, case and a missing middle name. */
export function nameSimilarity(a: PatientIdentity, b: PatientIdentity): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  return (directional(ta, tb) + directional(tb, ta)) / 2;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parseDob(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export type DobRelation = "exact" | "day_month_swapped" | "same_year_month" | "same_year" | "different";

export function dobSimilarity(a: string, b: string): { score: number; relation: DobRelation } {
  const x = parseDob(a);
  const y = parseDob(b);
  if (!x || !y) return { score: 0, relation: "different" };
  if (x.y === y.y && x.m === y.m && x.d === y.d) return { score: 1, relation: "exact" };
  if (x.y === y.y && x.m === y.d && x.d === y.m) return { score: 0.75, relation: "day_month_swapped" };
  if (x.y === y.y && x.m === y.m) return { score: 0.5, relation: "same_year_month" };
  if (x.y === y.y) return { score: 0.25, relation: "same_year" };
  return { score: 0, relation: "different" };
}

function phoneSimilarity(
  a: readonly PhoneEntry[],
  b: readonly PhoneEntry[],
): { score: number; matched: boolean; shared: boolean } {
  let best = { score: 0, matched: false, shared: false };
  for (const p of a) {
    for (const q of b) {
      if (p.number !== q.number) continue;
      const shared = Boolean(p.isShared || q.isShared);
      const score = shared ? SHARED_PHONE_SCORE : 1;
      if (score > best.score) best = { score, matched: true, shared };
    }
  }
  return best;
}

function firstTokenOf(value: string): string {
  return normalizeName(value).split(" ")[0] ?? "";
}

export function scoreDuplicate(candidate: PatientIdentity, existing: PatientIdentity): DuplicateMatch {
  const nameScore = nameSimilarity(candidate, existing);
  const dob = dobSimilarity(candidate.dob, existing.dob);
  const phone = phoneSimilarity(candidate.phones, existing.phones);

  const raw = WEIGHTS.name * nameScore + WEIGHTS.dob * dob.score + WEIGHTS.phone * phone.score;
  const score = Math.round(raw * 1000) / 1000;

  const reasons: string[] = [];
  if (nameScore >= 0.95) reasons.push("Same name");
  else if (nameScore >= 0.85) reasons.push("Very similar name (possible spelling difference)");
  else if (nameScore >= 0.7) reasons.push("Similar name");

  if (dob.relation === "exact") reasons.push("Same date of birth");
  else if (dob.relation === "day_month_swapped") reasons.push("Date of birth matches with day and month swapped");
  else if (dob.relation === "same_year_month") reasons.push("Born in the same month and year");

  if (phone.matched) {
    reasons.push(
      phone.shared
        ? "Same phone number, but it is shared by family, so this is weak evidence"
        : "Same phone number",
    );
  }

  let level: MatchLevel = score >= THRESHOLDS.likely ? "likely" : score >= THRESHOLDS.possible ? "possible" : "none";

  // Guard 1: a phone number alone (or a weak name with a weak date) never flags a duplicate.
  // With today's weights this cannot be reached: the best score under these conditions is
  // below 0.575, which is under the "possible" threshold of 0.65. It stays as a safety net so
  // that retuning the weights can never let a phone-only match flag a duplicate.
  if (nameScore < 0.5 && dob.score < 0.75) level = "none";

  // Guard 2: same surname + same birth date + different first name may be twins or siblings.
  const sameSurname = tokenSimilarity(firstTokenOf(candidate.lastName), firstTokenOf(existing.lastName)) >= 0.9;
  const differentFirst = tokenSimilarity(firstTokenOf(candidate.firstName), firstTokenOf(existing.firstName)) < 0.6;
  if (level === "likely" && sameSurname && differentFirst && dob.relation === "exact") {
    level = "possible";
    reasons.push("Same surname and birth date but a different first name: could be twins or siblings");
  }

  return {
    level,
    score,
    nameScore: Math.round(nameScore * 1000) / 1000,
    dobScore: dob.score,
    phoneScore: phone.score,
    reasons,
  };
}

/** Returns existing patients that are likely or possible duplicates, best match first. */
export function findDuplicates<T extends PatientIdentity & { id: string }>(
  candidate: PatientIdentity,
  existing: readonly T[],
): Array<{ patient: T; match: DuplicateMatch }> {
  const out: Array<{ patient: T; match: DuplicateMatch }> = [];
  for (const patient of existing) {
    const match = scoreDuplicate(candidate, patient);
    if (match.level !== "none") out.push({ patient, match });
  }
  return out.sort((x, y) => y.match.score - x.match.score);
}