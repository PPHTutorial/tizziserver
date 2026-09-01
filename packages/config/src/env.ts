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

  // --- Auth / JWT (Phase 1) ------------------------------------------
  // EdDSA (Ed25519) keypair, base64-encoded DER: PKCS8 private, SPKI public.
  // Generate: node -e "const{generateKeyPairSync}=require('crypto');const{privateKey,publicKey}=generateKeyPairSync('ed25519');console.log('priv',privateKey.export({type:'pkcs8',format:'der'}).toString('base64'));console.log('pub',publicKey.export({type:'spki',format:'der'}).toString('base64'))"
  JWT_PRIVATE_KEY: z.string().min(40),
  JWT_PUBLIC_KEY: z.string().min(40),
  JWT_ISSUER: z.string().default("stall"),
  JWT_AUDIENCE: z.string().default("stall-app"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(60),
  JWT_SECRET: z.string().min(16).optional(), // legacy, unused

  // --- OTP ---------------------------------------------------------
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(45),

  // --- SMS provider (Phase 1). `log` prints codes to the server log in dev.
  SMS_PROVIDER: z.enum(["log", "nalo", "twilio"]).default("log"),
  NALO_API_BASE_URL: z.string().url().optional(),
  NALO_API_KEY: z.string().optional(),
  NALO_SENDER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // --- Social sign-in (Phase 1; verification wired incrementally) ----
  GOOGLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),

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
