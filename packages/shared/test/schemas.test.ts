import { afterEach, describe, expect, it, vi } from "vitest";
import { loginSchema, moveQueueSchema, registerAndQueueSchema, registerPatientSchema } from "../src/index";

const valid = {
  firstName: "  Amina ",
  lastName: "Yusuf",
  dob: "1994-08-21",
  sex: "female" as const,
  phones: [{ number: "0803 123 4567" }],
  email: "",
  consent: { versionId: "consent-v1" },
};

function issues(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) {
  return result.error?.issues.map((i) => `${i.path.join(".")}: ${i.message}`) ?? [];
}

describe("registerPatientSchema", () => {
  it("accepts a valid patient and normalises fields", () => {
    const r = registerPatientSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.firstName).toBe("Amina");
    expect(r.data.phones).toEqual([{ number: "+2348031234567", isShared: false }]);
    expect(r.data.email).toBeUndefined();
    expect(r.data.consent.whatsappOptIn).toBe(false);
    expect(r.data.confirmNotDuplicate).toBe(false);
  });

  it("accepts a patient with no email", () => {
    const { email: _email, ...withoutEmail } = valid;
    expect(registerPatientSchema.safeParse(withoutEmail).success).toBe(true);
  });

  it("rejects a bad phone number with a plain-English message", () => {
    const r = registerPatientSchema.safeParse({ ...valid, phones: [{ number: "12345" }] });
    expect(r.success).toBe(false);
    expect(issues(r)).toContain("phones.0.number: Use a Nigerian mobile number, for example 0803 123 4567");
  });

  it("requires a phone unless the record is linked to a mother", () => {
    const noPhone = registerPatientSchema.safeParse({ ...valid, phones: [] });
    expect(noPhone.success).toBe(false);
    expect(issues(noPhone)).toContain("phones: Add a phone number, or link the mother's record for a newborn");

    const newborn = registerPatientSchema.safeParse({ ...valid, phones: [], motherId: "patient-123", dob: "2026-09-28" });
    expect(newborn.success).toBe(true);
  });

  it("requires recorded consent", () => {
    const r = registerPatientSchema.safeParse({ ...valid, consent: { versionId: "" } });
    expect(r.success).toBe(false);
    expect(issues(r)).toContain("consent.versionId: Record the patient's consent before registering");
  });

  it("rejects impossible or future dates of birth", () => {
    expect(registerPatientSchema.safeParse({ ...valid, dob: "2026-02-31" }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...valid, dob: "2999-01-01" }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...valid, dob: "1850-01-01" }).success).toBe(false);
  });

  describe("date of birth uses the Lagos calendar day", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("accepts a newborn's birth date just after midnight in Lagos, when UTC is still the day before", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-30T23:30:00Z")); // 00:30 on 1 Oct in Lagos
      expect(registerPatientSchema.safeParse({ ...valid, dob: "2026-10-01" }).success).toBe(true);
      expect(registerPatientSchema.safeParse({ ...valid, dob: "2026-10-02" }).success).toBe(false);
    });
  });

  it("needs a reason when the front desk confirms a flagged duplicate is a different person", () => {
    const without = registerPatientSchema.safeParse({ ...valid, confirmNotDuplicate: true });
    expect(without.success).toBe(false);
    expect(issues(without)).toContain("notDuplicateReason: Give a short reason why this is a different person");

    const withReason = registerPatientSchema.safeParse({
      ...valid,
      confirmNotDuplicate: true,
      notDuplicateReason: "Different mother named on card",
    });
    expect(withReason.success).toBe(true);
  });

  it("marks a shared family phone", () => {
    const r = registerPatientSchema.safeParse({ ...valid, phones: [{ number: "0803 123 4567", isShared: true }] });
    expect(r.success && r.data.phones[0]?.isShared).toBe(true);
  });
});

describe("registerAndQueueSchema", () => {
  it("defaults priority to standard", () => {
    const r = registerAndQueueSchema.safeParse({ patient: valid });
    expect(r.success && r.data.priority).toBe("standard");
  });

  it("accepts urgent and rejects unknown priorities", () => {
    expect(registerAndQueueSchema.safeParse({ patient: valid, priority: "urgent" }).success).toBe(true);
    expect(registerAndQueueSchema.safeParse({ patient: valid, priority: "vip" }).success).toBe(false);
  });
});

describe("moveQueueSchema", () => {
  it("accepts stations and done", () => {
    expect(moveQueueSchema.safeParse({ to: "lab" }).success).toBe(true);
    expect(moveQueueSchema.safeParse({ to: "done", reason: "" }).success).toBe(true);
    expect(moveQueueSchema.safeParse({ to: "canteen" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("validates the email address", () => {
    expect(loginSchema.safeParse({ email: "nurse@meridian.example", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});