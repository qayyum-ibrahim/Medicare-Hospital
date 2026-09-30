// Phase 0 check: is your MongoDB good enough for Meridian Care?
//
// Usage (works the same on Windows, macOS and Linux):
//   node check.mjs "<connection string>"
//
// It checks: Node version, connection, replica set, transaction commit, transaction abort.
// It writes to a throwaway database called "meridian_check" and cleans up after itself.
// Never paste a connection string containing a real password anywhere public.

import { MongoClient } from "mongodb";

const uri = process.argv[2] ?? process.env.MONGODB_URI;

if (!uri) {
  console.error('Usage: node check.mjs "<connection string>"');
  process.exit(2);
}

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// 1. Node version (Mongoose 9 needs 20.19 or newer)
const [major, minor] = process.versions.node.split(".").map(Number);
const nodeOk = major > 20 || (major === 20 && minor >= 19);
record("Node version is 20.19 or newer (22+ recommended)", nodeOk, `found ${process.version}`);

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });

try {
  // 2. Connection
  await client.connect();
  const admin = client.db("admin");
  const build = await admin.command({ buildInfo: 1 });
  record("Connected to MongoDB", true, `server ${build.version}`);

  // 3. Replica set (multi-document transactions need it)
  const hello = await admin.command({ hello: 1 });
  const isReplicaSet = Boolean(hello.setName);
  record(
    "Running as a replica set (needed for transactions)",
    isReplicaSet,
    isReplicaSet ? `set "${hello.setName}"` : "standalone server, see docs/DEV_SETUP.md"
  );

  if (isReplicaSet) {
    const db = client.db("meridian_check");
    const col = db.collection("tx_probe");
    // Create the collection outside any transaction first.
    await db.createCollection("tx_probe").catch(() => {});

    // 4. Transaction commit
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await col.insertOne({ probe: "commit" }, { session });
      });
      const committed = await col.countDocuments({ probe: "commit" });
      record("Transaction commits", committed === 1, `${committed} document found`);
    } catch (err) {
      record("Transaction commits", false, err.message);
    }

    // 5. Transaction abort (a failed transaction must leave nothing behind)
    try {
      await session.withTransaction(async () => {
        await col.insertOne({ probe: "abort" }, { session });
        throw new Error("intentional abort");
      });
    } catch (err) {
      if (err.message !== "intentional abort") {
        record("Transaction rolls back", false, err.message);
      } else {
        const leftover = await col.countDocuments({ probe: "abort" });
        record("Transaction rolls back", leftover === 0, `${leftover} leftover documents`);
      }
    } finally {
      await session.endSession();
    }

    // Clean up the throwaway collection.
    await col.drop().catch(() => {});
  } else {
    record("Transaction commits", false, "skipped: not a replica set");
    record("Transaction rolls back", false, "skipped: not a replica set");
  }
} catch (err) {
  record("Connected to MongoDB", false, err.message);
  console.error("\nCould not connect. Common causes:");
  console.error("  - wrong connection string, or a password with special characters that is not URL-encoded");
  console.error("  - MongoDB Atlas: your current IP address is not in the Network Access allow-list");
  console.error("  - Docker: the container is not running yet, or has not finished starting");
} finally {
  await client.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "All checks passed." : `${failed} check(s) failed.`} Paste this whole output back to me.`);
process.exit(failed === 0 ? 0 : 1);
