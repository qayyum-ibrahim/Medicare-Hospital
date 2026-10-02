import { describe, expect, it } from "vitest";
import { UserModel } from "../src/users/userModel";

const valid = {
  name: "Funmilayo Adebayo",
  email: "  Nurse@Meridian.Example ",
  role: "nurse",
  passwordHash: "scrypt$1024$8$1$c2FsdA==$aGFzaA==",
};

async function validationErrors(data: Record<string, unknown>): Promise<string[]> {
  try {
    await new UserModel(data).validate();
    return [];
  } catch (err) {
    const errors = (err as { errors?: Record<string, unknown> }).errors ?? {};
    return Object.keys(errors).sort();
  }
}

describe("UserModel validation (no database connection needed)", () => {
  it("accepts a valid user, normalises the email and defaults to active", async () => {
    const doc = new UserModel(valid);
    await doc.validate();
    expect(doc.get("email")).toBe("nurse@meridian.example");
    expect(doc.get("active")).toBe(true);
    expect(doc.get("lastLoginAt")).toBeNull();
  });

  it("rejects a role that is not one of the seven roles", async () => {
    expect(await validationErrors({ ...valid, role: "janitor" })).toEqual(["role"]);
  });

  it("requires name, email and password hash", async () => {
    expect(await validationErrors({ role: "nurse" })).toEqual(["email", "name", "passwordHash"]);
  });

  it("keeps the password hash out of normal query results", () => {
    expect(UserModel.schema.path("passwordHash").options["select"]).toBe(false);
  });
});