import { z } from "zod";

/** Env values are always strings — coerce "false"/"0"/"no" to false, not true. */
const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === "" ? def : !["false", "0", "no", "off"].includes(v.toLowerCase())));

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
  // `mock` writes to local disk — no external accounts, same sandbox
  // philosophy as PAYMENTS_PROVIDER. Swap to `s3` once the MinIO/R2 bucket
  // above is actually reachable.
  STORAGE_PROVIDER: z.enum(["mock", "s3"]).default("mock"),
  STORAGE_MOCK_DIR: z.string().default("./.storage-mock"),

  // --- Email (v1: nodemailer/SMTP; Mailpit in docker) ----------------
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // --- Payments (Phase 3) ------------------------------------------------
  // `mock` is a deterministic in-process sandbox — no external accounts (B4).
  // Swap to a real provider once its sandbox keys are set.
  PAYMENTS_PROVIDER: z.enum(["mock", "paystack", "flutterwave", "stripe"]).default("mock"),
  PAYMENTS_CURRENCY: z.string().default("GHS"),
  // Shared secret the mock gateway's webhook caller must HMAC-sign the raw body
  // with (header `x-mock-signature`). Dev-only default — set a real random
  // value before ever exposing this endpoint outside a trusted sandbox.
  MOCK_PAYMENTS_WEBHOOK_SECRET: z.string().default("dev-only-mock-webhook-secret-change-me"),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // --- Maps (Phase 4) -------------------------------------------------
  // Server-proxied Directions / Distance Matrix. Unset ⇒ a haversine + fixed
  // average-speed fallback is used (dev / B5 not yet provisioned).
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  // Road routing (OSRM). Defaults to the public demo server — fine for dev;
  // point at a self-hosted OSRM (docker) for production. Unset it entirely to
  // force the haversine fallback (no road-following polyline).
  OSRM_URL: z.string().url().default("https://router.project-osrm.org"),
  MAPS_AVG_SPEED_KMH: z.coerce.number().positive().default(22),
  MAPS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(120),

  // --- Realtime / dispatch (Phase 4) --------------------------------
  REALTIME_URL: z.string().url().optional(),
  DISPATCH_OFFER_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  DISPATCH_SHORTLIST_RADIUS_M: z.coerce.number().int().positive().default(6000),
  DISPATCH_SHORTLIST_SIZE: z.coerce.number().int().positive().default(8),
  DELIVERY_BASE_FEE_MINOR: z.coerce.number().int().nonnegative().default(800),
  DELIVERY_PER_KM_MINOR: z.coerce.number().int().nonnegative().default(150),
  DELIVERY_COURIER_SHARE_BPS: z.coerce.number().int().positive().max(10000).default(8000),

  // --- Push notifications (Phase 4/6) ------------------------------
  // Unset ⇒ notifications are persisted + logged only (B6 not yet provisioned).
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),

  // --- Auctions / Inverse Draws (Phase 5) --------------------------
  AUCTION_PRIZE_DELIVERY_FEE_MINOR: z.coerce.number().int().nonnegative().default(1500),
  AUCTION_WAREHOUSE_LAT: z.coerce.number().default(5.6037),
  AUCTION_WAREHOUSE_LNG: z.coerce.number().default(-0.187),

  // --- Disputes / support (Phase 6) -------------------------------
  DISPUTE_SLA_HOURS: z.coerce.number().int().positive().default(72),
  APPEAL_WINDOW_HOURS: z.coerce.number().int().positive().default(168),

  // --- Advertising / boosting / referrals (Phase 7) ----------------
  // Fallbacks only — real prices live in the editable `BoostTier` table.
  ADS_DEFAULT_CPM_MINOR: z.coerce.number().int().nonnegative().default(4000),
  ADS_DEFAULT_CPC_MINOR: z.coerce.number().int().nonnegative().default(120),
  ADS_REVIEW_REQUIRED: boolish(true),
  ADS_MIN_BUDGET_MINOR: z.coerce.number().int().positive().default(5000),
  ANALYTICS_ROLLUP_RETENTION_DAYS: z.coerce.number().int().positive().default(120),
  REFERRAL_REWARD_MINOR: z.coerce.number().int().nonnegative().default(2000),
  REFERRAL_QUALIFY_MIN_ORDER_MINOR: z.coerce.number().int().nonnegative().default(5000),
  REFERRAL_EXPIRY_DAYS: z.coerce.number().int().positive().default(30),

  // --- Admin / ops console (Phase 7) ------------------------------
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  ADMIN_2FA_REQUIRED: boolish(true),

  // --- Privacy / data retention (Phase 8) ------------------------
  ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().nonnegative().default(14),
  AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(365),

  // --- Observability (Phase 8) — all optional; unset ⇒ no-op exporters
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_TRACES_SAMPLER_ARG: z.coerce.number().min(0).max(1).default(1),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // --- Platform ------------------------------------------------------
  DEFAULT_PLATFORM: z.string().default("grandprice"),

  // --- Brand logos (product/vendor "brand" field auto-illustration) ---
  // Unset ⇒ only the curated map in `catalog/brands.ts` resolves; unknown
  // brands fall back to the client's initials tile, no external call made.
  // Every resolved logo is downloaded once and re-hosted in our own object
  // storage (`STORAGE_PROVIDER`) — Brandfetch is never hit twice for the
  // same brand, and the key is a secret that never leaves the backend.
  BRANDFETCH_API_KEY: z.string().optional(),
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
