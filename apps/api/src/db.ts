import mongoose from "mongoose";

export interface DbStatus {
  connected: boolean;
  /** Name of the replica set, or null for a standalone server. Transactions need a replica set. */
  replicaSet: string | null;
}

export async function connectDb(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, appName: "meridian-care" });
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

export async function dbStatus(): Promise<DbStatus> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) return { connected: false, replicaSet: null };
  const hello = await db.admin().command({ hello: 1 });
  return { connected: true, replicaSet: typeof hello["setName"] === "string" ? hello["setName"] : null };
}