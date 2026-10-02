import { z } from "zod";

const missingUri = "MONGODB_URI is required. Copy .env.example to .env and fill it in.";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z
    .string(missingUri)
    .min(1, missingUri)
    .refine(
      (uri) => uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://"),
      "MONGODB_URI must start with mongodb:// or mongodb+srv://",
    ),
});

export type Config = z.infer<typeof envSchema>;

/**
 * Reads and validates environment variables. Error messages never include the values,
 * so a connection string can never leak into logs through a config mistake.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

/** The host part of a connection string, safe to print. */
export function redactedHost(uri: string): string {
  try {
    return new URL(uri).hostname || "database";
  } catch {
    return "database";
  }
}

/** Removes credentials from any text that might contain a connection string. */
export function scrubSecrets(text: string): string {
  return text.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, "$1***@");
}

const missingDemoPassword =
  "DEMO_PASSWORD is required for seeding. Add DEMO_PASSWORD=... (at least 10 characters) to your .env file.";

const seedEnvSchema = envSchema.extend({
  DEMO_PASSWORD: z.string(missingDemoPassword).min(10, "DEMO_PASSWORD must be at least 10 characters"),
});

export type SeedConfig = z.infer<typeof seedEnvSchema>;

/** Like loadConfig, plus the shared password used for the fictional demo accounts. */
export function loadSeedConfig(env: Record<string, string | undefined> = process.env): SeedConfig {
  const parsed = seedEnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}