import { describe, expect, it } from "vitest";
import {
  dobSimilarity,
  findDuplicates,
  jaroWinkler,
  normalizeName,
  scoreDuplicate,
  type PatientIdentity,
} from "../src/index";

const phone = "+2348031234567";

const base: PatientIdentity = {
  firstName: "Olusegun",
  lastName: "Adeyemi",
  dob: "1985-06-14",
  phones: [{ number: phone }],
};

describe("name helpers", () => {
  it("strips tone marks, punctuation and extra spaces", () => {
    expect(normalizeName("  \u1ECC l\u00E1ol\u00FA  O'Brien-Smith ")).toBe("o laolu o brien smith");
  });

  it("matches the published Jaro-Winkler example", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.9611, 3);
  });
});

describe("dobSimilarity", () => {
  it("scores each relationship", () => {
    expect(dobSimilarity("1985-06-14", "1985-06-14")).toEqual({ score: 1, relation: "exact" });
    expect(dobSimilarity("1990-03-07", "1990-07-03")).toEqual({ score: 0.75, relation: "day_month_swapped" });
    expect(dobSimilarity("1990-03-07", "1990-03-20").relation).toBe("same_year_month");
    expect(dobSimilarity("1990-03-07", "1990-11-20").relation).toBe("same_year");
    expect(dobSimilarity("1990-03-07", "1991-03-07").relation).toBe("different");
    expect(dobSimilarity("not-a-date", "1991-03-07").score).toBe(0);
  });
});

describe("scoreDuplicate", () => {
  it("flags an exact match as likely", () => {
    const m = scoreDuplicate(base, base);
    expect(m.level).toBe("likely");
    expect(m.score).toBe(1);
  });

  it("flags a misspelled surname as likely", () => {
    const m = scoreDuplicate({ ...base, lastName: "Adeyemy" }, base);
    expect(m.level).toBe("likely");
    expect(m.reasons).toContain("Same date of birth");
  });

  it("ignores name order", () => {
    const m = scoreDuplicate({ ...base, firstName: "Adeyemi", lastName: "Olusegun" }, base);
    expect(m.nameScore).toBe(1);
    expect(m.level).toBe("likely");
  });

  it("ignores tone marks", () => {
    const m = scoreDuplicate({ ...base, firstName: "\u1ECCl\u00FA\u1E63\u1EB9\u0301gun" }, base);
    expect(m.nameScore).toBe(1);
    expect(m.level).toBe("likely");
  });

  it("treats common spelling variants of Muhammad as the same name", () => {
    const a: PatientIdentity = { firstName: "Mohammed", lastName: "Bello", dob: "1979-02-02", phones: [{ number: phone }] };
    const b: PatientIdentity = { ...a, firstName: "Muhammad" };
    expect(scoreDuplicate(a, b).nameScore).toBe(1);
  });

  it("handles an initial against a full first name", () => {
    const m = scoreDuplicate({ ...base, firstName: "O." }, base);
    expect(m.level).toBe("likely");
  });

  it("flags same name and date of birth with a new phone number", () => {
    const m = scoreDuplicate({ ...base, phones: [{ number: "+2348099998888" }] }, base);
    expect(m.level).toBe("likely");
    expect(m.phoneScore).toBe(0);
  });

  it("catches a day and month swapped in the date of birth", () => {
    const a: PatientIdentity = { firstName: "Ibrahim", lastName: "Musa", dob: "1990-03-07", phones: [{ number: phone }] };
    const b: PatientIdentity = { ...a, dob: "1990-07-03" };
    const m = scoreDuplicate(a, b);
    expect(m.level).toBe("likely");
    expect(m.reasons).toContain("Date of birth matches with day and month swapped");
  });

  it("does not flag people who only share a common name", () => {
    const a: PatientIdentity = { firstName: "Chinedu", lastName: "Okafor", dob: "1992-01-20", phones: [{ number: "+2348011111111" }] };
    const b: PatientIdentity = { ...a, dob: "1978-11-05", phones: [{ number: "+2348022222222" }] };
    expect(scoreDuplicate(a, b).level).toBe("none");
  });

  it("never flags on a phone match alone", () => {
    const a: PatientIdentity = { firstName: "Chidi", lastName: "Nwosu", dob: "1970-01-01", phones: [{ number: phone }] };
    const b: PatientIdentity = { firstName: "Aisha", lastName: "Bello", dob: "1999-12-31", phones: [{ number: phone }] };
    expect(scoreDuplicate(a, b).level).toBe("none");
  });

  it("does not flag family members who share a phone number", () => {
    const mother: PatientIdentity = {
      firstName: "Funke",
      lastName: "Balogun",
      dob: "1988-04-12",
      phones: [{ number: phone, isShared: true }],
    };
    const sister: PatientIdentity = {
      firstName: "Kemi",
      lastName: "Balogun",
      dob: "1991-09-02",
      phones: [{ number: phone, isShared: true }],
    };
    const m = scoreDuplicate(sister, mother);
    expect(m.level).toBe("none");
    expect(m.phoneScore).toBe(0.4);
  });

  it("does not flag a newborn against the mother", () => {
    const mother: PatientIdentity = {
      firstName: "Funke",
      lastName: "Balogun",
      dob: "1988-04-12",
      phones: [{ number: phone, isShared: true }],
    };
    const baby: PatientIdentity = {
      firstName: "Adaeze",
      lastName: "Balogun",
      dob: "2026-09-28",
      phones: [{ number: phone, isShared: true }],
    };
    expect(scoreDuplicate(baby, mother).level).toBe("none");
  });

  it("caps twins at possible so a person reviews them", () => {
    const taiwo: PatientIdentity = { firstName: "Taiwo", lastName: "Ojo", dob: "2015-05-05", phones: [{ number: phone }] };
    const kehinde: PatientIdentity = { ...taiwo, firstName: "Kehinde" };
    const m = scoreDuplicate(kehinde, taiwo);
    // Without the twin guard this pair would score as "likely": prove the guard is what caps it.
    expect(m.score).toBeGreaterThanOrEqual(0.85);
    expect(m.level).toBe("possible");
    expect(m.reasons).toContain("Same surname and birth date but a different first name: could be twins or siblings");
  });
});

describe("findDuplicates", () => {
  it("returns likely and possible matches, best first, and skips the rest", () => {
    const existing = [
      { id: "p-unrelated", firstName: "Aisha", lastName: "Bello", dob: "1999-12-31", phones: [{ number: "+2348055550000" }] },
      { id: "p-close", ...base, lastName: "Adeyemy" },
      { id: "p-exact", ...base },
    ];
    const found = findDuplicates(base, existing);
    expect(found.map((f) => f.patient.id)).toEqual(["p-exact", "p-close"]);
  });
});