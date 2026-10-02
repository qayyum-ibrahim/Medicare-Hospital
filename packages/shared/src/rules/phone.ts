/**
 * Nigerian mobile number handling.
 *
 * This is a FORMAT check only. It does not verify that a number is in service or
 * belongs to a carrier. It accepts mobile-style numbers (ten digits after +234,
 * starting 7, 8 or 9). Landlines and non-Nigerian numbers are not supported in the
 * prototype. Logged in docs/ASSUMPTIONS.md (D-009): verify with the hospital.
 */

export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: string };

export function normalizeNigerianPhone(input: string): PhoneResult {
  const cleaned = input.trim().replace(/[\s\-.()]/g, "");
  if (cleaned === "") return { ok: false, reason: "Enter a phone number" };
  if (!/^\+?\d+$/.test(cleaned)) return { ok: false, reason: "Phone numbers can only contain digits" };

  let digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  if (digits.startsWith("00234")) digits = digits.slice(2);

  let national: string;
  if (digits.startsWith("234") && digits.length === 13) national = digits.slice(3);
  else if (digits.startsWith("0") && digits.length === 11) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return { ok: false, reason: "Use a Nigerian mobile number, for example 0803 123 4567" };

  if (!/^[789]\d{9}$/.test(national)) {
    return { ok: false, reason: "That does not look like a Nigerian mobile number" };
  }
  return { ok: true, e164: `+234${national}` };
}

/** +2348031234567 -> "0803 123 4567". Returns the input unchanged if it is not a +234 number. */
export function formatPhoneLocal(e164: string): string {
  const m = /^\+234([789]\d{2})(\d{3})(\d{4})$/.exec(e164);
  if (!m) return e164;
  return `0${m[1]} ${m[2]} ${m[3]}`;
}