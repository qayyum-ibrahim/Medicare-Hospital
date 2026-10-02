import { z } from "zod";

const missingUri = "MONGODB_URI is required. Copy .env.example to .env and fill it in.";

const baseEnvSchema = z.object({
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

const missingDemoPassword =
  "DEMO_PASSWORD is required for seeding. Add DEMO_PASSWORD=... (at least 10 characters) to your .env file.";

const seedEnvSchema = baseEnvSchema.extend({
  DEMO_PASSWORD: z.string(missingDemoPassword).min(10, "DEMO_PASSWORD must be at least 10 characters"),
});

const missingJwtSecret =
  "JWT_ACCESS_SECRET is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"";

const serverEnvSchema = baseEnvSchema.extend({
  JWT_ACCESS_SECRET: z.string(missingJwtSecret).min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
});

export type Config = z.infer<typeof baseEnvSchema>;
export type SeedConfig = z.infer<typeof seedEnvSchema>;
export type ServerConfig = z.infer<typeof serverEnvSchema>;

/**
 * Error messages never include the values, so a secret can never leak into logs
 * through a configuration mistake.
 */
function parseEnv<S extends z.ZodType>(schema: S, env: Record<string, string | undefined>): z.output<S> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}

/** The basics: database connection string, port and environment. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return parseEnv(baseEnvSchema, env);
}

/** The basics plus the shared password used for the fictional demo accounts. */
export function loadSeedConfig(env: Record<string, string | undefined> = process.env): SeedConfig {
  return parseEnv(seedEnvSchema, env);
}

/** The basics plus what the running API needs to sign people in. */
export function loadServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return parseEnv(serverEnvSchema, env);
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