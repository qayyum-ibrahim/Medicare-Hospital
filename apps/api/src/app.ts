import express, { type NextFunction, type Request, type Response } from "express";
import type { DbStatus } from "./db";
import { scrubSecrets } from "./config";

export interface AppDeps {
  getDbStatus: () => Promise<DbStatus>;
}

function httpStatusOf(err: unknown): number {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 600) return status;
  }
  return 500;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "meridian-care-api",
      notice: "Demo: fictional data only",
      time: new Date().toISOString(),
    });
  });

  app.get("/health/db", async (_req, res) => {
    const db = await deps.getDbStatus();
    res.status(db.connected ? 200 : 503).json({
      status: db.connected ? "ok" : "unavailable",
      replicaSet: db.replicaSet !== null,
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Not found" } });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = httpStatusOf(err);
    if (status < 500) {
      res.status(status).json({ error: { code: "bad_request", message: "The request could not be understood" } });
      return;
    }
    console.error("Unhandled error:", scrubSecrets(err instanceof Error ? err.message : String(err)));
    res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
  });

  return app;
}
