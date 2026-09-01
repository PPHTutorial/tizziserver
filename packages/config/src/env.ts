import { z } from "zod";

/**
 * Central environment contract for every Stall service.
 * Add keys here as phases introduce them — never read `process.env.X` directly
 * in application code; import `env` from `@stall/config`.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // --- Database (Phase 0) -------------------------------------------------
  DATABASE_URL: z.string().url(),
  DATABASE_POOLING_URL: z.string().url().optional(),

  // --- Auth / JWT (present in v1; hardened in Phase 1) ------------------
  JWT_SECRET: z.string().min(16).optional(),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("60d"),

  // --- Redis (Phase 0 infra, wired Phase 1+) --------------------------
  REDIS_URL: z.string().url().optional(),

  // --- Object storage: MinIO local / R2 prod (Phase 0 infra) ----------
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),

  // --- Email (v1: nodemailer/SMTP; Mailpit in docker) ----------------
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // --- Platform ------------------------------------------------------
  DEFAULT_PLATFORM: z.string().default("grandprice"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env: Env = loadEnv();
