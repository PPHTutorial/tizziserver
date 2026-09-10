import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

// OWASP-ish argon2id params. `algorithm: 2` == Argon2id (const enum can't be
// imported under isolatedModules, so the numeric value is used directly).
const ARGON_OPTS = {
  algorithm: 2,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** argon2id hash — for low-entropy secrets: passwords, PINs, OTP codes, recovery codes. */
export const hashSecret = (secret: string): Promise<string> => argonHash(secret, ARGON_OPTS);

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  try {
    return await argonVerify(hash, secret);
  } catch {
    return false;
  }
}

/** Opaque high-entropy token (base64url, no padding). Default 32 bytes = 256 bits. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** SHA-256 hex — for O(1) lookup of high-entropy tokens (refresh tokens). Not for passwords. */
export const sha256Hex = (input: string): string => createHash("sha256").update(input).digest("hex");

/** HMAC-SHA256 hex — for signing/verifying webhook payloads against a shared secret. */
export const hmacHex = (secret: string, data: string): string =>
  createHmac("sha256", secret).update(data).digest("hex");

/** Constant-time hex-string comparison — use for signatures, never `===`. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Numeric OTP code of the given length, uniformly random, leading zeros preserved. */
export function numericCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}
