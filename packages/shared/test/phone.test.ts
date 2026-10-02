import { describe, expect, it } from "vitest";
import { formatPhoneLocal, maskPhone, maskTail, normalizeNigerianPhone } from "../src/index";

describe("normalizeNigerianPhone", () => {
  it.each([
    ["0803 123 4567"],
    ["+234 803 123 4567"],
    ["234-803-123-4567"],
    ["8031234567"],
    ["(0803) 123.4567"],
    ["00234 803 123 4567"],
  ])("normalises %s", (input) => {
    expect(normalizeNigerianPhone(input)).toEqual({ ok: true, e164: "+2348031234567" });
  });

  it.each([
    ["", "Enter a phone number"],
    ["abc123", "Phone numbers can only contain digits"],
    ["12345", "Use a Nigerian mobile number, for example 0803 123 4567"],
    ["+44 7911 123456", "Use a Nigerian mobile number, for example 0803 123 4567"],
    ["0603 123 4567", "That does not look like a Nigerian mobile number"],
  ])("rejects %j", (input, reason) => {
    expect(normalizeNigerianPhone(input)).toEqual({ ok: false, reason });
  });

  it("formats for local display and leaves other values alone", () => {
    expect(formatPhoneLocal("+2348031234567")).toBe("0803 123 4567");
    expect(formatPhoneLocal("hello")).toBe("hello");
  });
});

describe("masking", () => {
  it("masks the middle of a +234 number", () => {
    expect(maskPhone("+2348031234567")).toBe("+234 803 \u2022\u2022\u2022 4567");
  });

  it("keeps only the tail of other values", () => {
    expect(maskTail("MB123456789", 3)).toBe("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022789");
    expect(maskTail("ab", 3)).toBe("\u2022\u2022");
    expect(maskPhone("12345678")).toBe("\u2022\u2022\u2022\u20225678");
  });
});