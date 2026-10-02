import { loadSeedConfig, redactedHost, scrubSecrets } from "../config";
import { connectDb, disconnectDb } from "../db";
import { MongoUserRepo } from "../users/mongoUserRepo";
import { UserModel } from "../users/userModel";
import { seedDemoUsers } from "./demoUsers";

async function main(): Promise<void> {
  const config = loadSeedConfig();

  console.log(`Connecting to ${redactedHost(config.MONGODB_URI)} ...`);
  await connectDb(config.MONGODB_URI);
  await UserModel.init(); // makes sure the unique email index exists

  console.log("Creating demo users (this takes a few seconds, passwords are hashed on purpose) ...");
  const result = await seedDemoUsers(new MongoUserRepo(), config.DEMO_PASSWORD);

  console.log(`\nDone: ${result.created} created, ${result.updated} updated.\n`);
  console.log("Demo logins (fictional staff). The password is the DEMO_PASSWORD value in apps/api/.env:");
  for (const user of result.users) {
    console.log(`  ${user.role.padEnd(11)} ${user.email.padEnd(30)} ${user.name}`);
  }
}

main()
  .catch((err: unknown) => {
    console.error("Seed failed:", scrubSecrets(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());