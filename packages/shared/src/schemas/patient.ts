import { z } from "zod";
import { normalizeNigerianPhone } from "../rules/phone";
import { PRIORITIES } from "../rules/queue";
import { lagosDate } from "../time";

const nameField = (label: string) => z.string().trim().min(1, `Enter ${label}`).max(60, "That is too long");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "That is too long")
    .optional()
    .transform((v) => (v ? v : undefined));

const dobField = z.iso
  .date("Enter a valid date of birth")
  .refine((d) => d <= lagosDate(new Date()), "Date of birth cannot be in the future")
  .refine((d) => d >= "1900-01-01", "Check the year of birth");

/** A phone entry is validated and normalised to +234 format. */
const phoneEntry = z
  .object({
    number: z.string(),
    isShared: z.boolean().default(false),
  })
  .transform((value, ctx) => {
    const result = normalizeNigerianPhone(value.number);
    if (!result.ok) {
      ctx.issues.push({ code: "custom", message: result.reason, input: value.number, path: ["number"] });
      return z.NEVER;
    }
    return { number: result.e164, isShared: value.isShared };
  });

export const registerPatientSchema = z
  .object({
    firstName: nameField("a first name"),
    middleName: optionalText(60),
    lastName: nameField("a last name"),
    dob: dobField,
    sex: z.enum(["female", "male"], "Choose female or male"),
    phones: z.array(phoneEntry).max(3, "Up to three phone numbers").default([]),
    email: z
      .union([z.literal(""), z.email("Enter a valid email address")])
      .optional()
      .transform((v) => (v ? v : undefined)),
    address: z
      .object({
        line1: optionalText(120),
        area: optionalText(60),
        lga: optionalText(60),
        state: optionalText(40),
      })
      .default({ line1: undefined, area: undefined, lga: undefined, state: undefined }),
    /** For newborns: links the baby's record to the mother's. */
    motherId: z.string().min(1).optional(),
    consent: z.object({
      versionId: z.string().min(1, "Record the patient's consent before registering"),
      whatsappOptIn: z.boolean().default(false),
    }),
    /** Front desk confirms a flagged possible duplicate is a different person. */
    confirmNotDuplicate: z.boolean().default(false),
    notDuplicateReason: optionalText(200),
  })
  .superRefine((value, ctx) => {
    if (value.phones.length === 0 && !value.motherId) {
      ctx.addIssue({
        code: "custom",
        path: ["phones"],
        message: "Add a phone number, or link the mother's record for a newborn",
      });
    }
    if (value.confirmNotDuplicate && (value.notDuplicateReason ?? "").length < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["notDuplicateReason"],
        message: "Give a short reason why this is a different person",
      });
    }
  });

export type RegisterPatientInput = z.input<typeof registerPatientSchema>;
export type RegisterPatient = z.output<typeof registerPatientSchema>;

/** Register and queue in one action (front desk: three clicks or fewer). */
export const registerAndQueueSchema = z.object({
  patient: registerPatientSchema,
  priority: z.enum(PRIORITIES).default("standard"),
});

export type RegisterAndQueueInput = z.input<typeof registerAndQueueSchema>;