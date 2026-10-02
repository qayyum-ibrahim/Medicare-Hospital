import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";

const connected = async () => ({ connected: true, replicaSet: "rs0" });
const disconnected = async () => ({ connected: false, replicaSet: null });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /health", () => {
  it("reports that the API is up and that the data is fictional", async () => {
    const res = await request(createApp({ getDbStatus: connected })).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.notice).toBe("Demo: fictional data only");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("GET /health/db", () => {
  it("returns 200 when the database is connected, without exposing the replica set name", async () => {
    const res = await request(createApp({ getDbStatus: connected })).get("/health/db");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", replicaSet: true });
  });

  it("returns 503 when the database is not connected", async () => {
    const res = await request(createApp({ getDbStatus: disconnected })).get("/health/db");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable", replicaSet: false });
  });
});

describe("error handling", () => {
  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(createApp({ getDbStatus: connected })).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Not found" } });
  });

  it("returns a generic 500 and logs without leaking credentials", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = async () => {
      throw new Error("could not reach mongodb+srv://bob:hunter2@cluster0.example.net/meridian");
    };
    const res = await request(createApp({ getDbStatus: failing })).get("/health/db");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "internal_error", message: "Something went wrong" } });
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("hunter2");
    expect(logged).toContain("***@cluster0.example.net");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await request(createApp({ getDbStatus: connected }))
      .post("/anything")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_request");
  });
});