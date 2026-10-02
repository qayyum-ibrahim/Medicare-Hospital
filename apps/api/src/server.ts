import { createApp } from "./app";
import { loadConfig, redactedHost, scrubSecrets } from "./config";
import { connectDb, dbStatus, disconnectDb } from "./db";

async function main(): Promise<void> {
  const config = loadConfig();

  console.log(`Connecting to ${redactedHost(config.MONGODB_URI)} ...`);
  await connectDb(config.MONGODB_URI);

  const status = await dbStatus();
  console.log(`Database connected${status.replicaSet ? ` (replica set "${status.replicaSet}")` : ""}`);
  if (!status.replicaSet) {
    console.warn("WARNING: this database is not a replica set, so transactions will not work. See docs/DEV_SETUP.md.");
  }

  const app = createApp({ getDbStatus: dbStatus });
  const server = app.listen(config.PORT, () => {
    console.log(`API listening on http://localhost:${config.PORT}  (Demo: fictional data only)`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error("Failed to start:", scrubSecrets(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});