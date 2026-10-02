/** Identifier masking for roles that do not need full values (P10). */

const DOT = "\u2022";

/** +2348031234567 -> "+234 803 ••• 4567". Anything else keeps only its last four characters. */
export function maskPhone(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+234 ${m[1]} ${DOT.repeat(3)} ${m[3]}`;
  return maskTail(e164, 4);
}

/** Keeps the last `visible` characters and masks the rest. */
export function maskTail(value: string, visible = 3): string {
  if (value.length <= visible) return DOT.repeat(value.length);
  return DOT.repeat(value.length - visible) + value.slice(value.length - visible);
}