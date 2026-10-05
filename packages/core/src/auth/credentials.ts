import { Secret, TOTP } from "otpauth";
import { prisma } from "@stall/db";
import { hashSecret, numericCode, sha256Hex, verifySecret } from "../crypto.ts";
import { AppError } from "../errors.ts";
import { rateLimit } from "../redis.ts";
import { verifyOtp } from "./otp.ts";

const PIN_RE = /^\d{4,6}$/;
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 15 * 60_000;

// ---------------------------------------------------------------- password
export async function setPassword(userId: string, password: string): Promise<void> {
  if (password.length < 8) throw new AppError("VALIDATION", "Password must be at least 8 characters");
  await prisma.credential.upsert({
    where: { userId_kind: { userId, kind: "PASSWORD" } },
    create: { userId, kind: "PASSWORD", secretHash: await hashSecret(password) },
    update: { secretHash: await hashSecret(password) },
  });
}

export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const c = await prisma.credential.findUnique({ where: { userId_kind: { userId, kind: "PASSWORD" } } });
  return c ? verifySecret(c.secretHash, password) : false;
}

// --------------------------------------------------------------------- PIN
export async function setPin(userId: string, pin: string): Promise<void> {
  if (!PIN_RE.test(pin)) throw new AppError("VALIDATION", "PIN must be 4–6 digits");
  await prisma.credential.upsert({
    where: { userId_kind: { userId, kind: "PIN" } },
    create: { userId, kind: "PIN", secretHash: await hashSecret(pin), params: { failed: 0 } },
    update: { secretHash: await hashSecret(pin), params: { failed: 0 } },
  });
}

/**
 * User-facing set/replace. The first PIN can be set with just a session, but
 * REPLACING one must prove knowledge of the current PIN or of a RESET_PIN OTP
 * sent to the account phone — otherwise a stolen access token could reset the
 * PIN and then pass the PIN gate on withdrawals/payouts/transfers.
 */
export async function changePin(
  userId: string,
  pin: string,
  proof: { currentPin?: string; otpCode?: string } = {},
): Promise<void> {
  if (await hasPin(userId)) {
    if (proof.currentPin) {
      await verifyPin(userId, proof.currentPin);
    } else if (proof.otpCode) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
      if (!user.phone) throw new AppError("VALIDATION", "No phone on this account to verify a PIN reset");
      await verifyOtp({ target: user.phone, channel: "SMS", purpose: "RESET_PIN", code: proof.otpCode });
    } else {
      throw new AppError("FORBIDDEN", "Provide currentPin, or otpCode from a RESET_PIN code, to replace your PIN");
    }
  }
  await setPin(userId, pin);
}

export async function verifyPin(userId: string, pin: string): Promise<void> {
  // Atomic (Redis INCR) ceiling in front of the read-modify-write DB counter
  // below, which parallel requests could otherwise race past.
  const rl = await rateLimit(`pin:verify:${userId}`, PIN_MAX_FAILS * 2, PIN_LOCK_MS / 1000);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "PIN is temporarily locked — try again later");
  const c = await prisma.credential.findUnique({ where: { userId_kind: { userId, kind: "PIN" } } });
  if (!c) throw new AppError("VALIDATION", "No transaction PIN is set");
  const p = (c.params as { failed?: number; lockedUntil?: number } | null) ?? {};
  if (p.lockedUntil && p.lockedUntil > Date.now()) {
    throw new AppError("RATE_LIMITED", "PIN is temporarily locked — try again later");
  }
  if (await verifySecret(c.secretHash, pin)) {
    if (p.failed) await prisma.credential.update({ where: { id: c.id }, data: { params: { failed: 0 } } });
    return;
  }
  const failed = (p.failed ?? 0) + 1;
  await prisma.credential.update({
    where: { id: c.id },
    data: { params: failed >= PIN_MAX_FAILS ? { failed, lockedUntil: Date.now() + PIN_LOCK_MS } : { failed } },
  });
  throw new AppError("VALIDATION", "Incorrect PIN");
}

export const hasPin = (userId: string) =>
  prisma.credential.count({ where: { userId, kind: "PIN" } }).then((n) => n > 0);

// -------------------------------------------------------------------- TOTP
const totpFor = (label: string, base32: string) =>
  new TOTP({ issuer: "Stall", label, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(base32) });

export async function enrollTotp(userId: string, label: string): Promise<{ uri: string; secret: string }> {
  // Re-enrolling over an ACTIVE secret would flip it back to pending and
  // silently switch 2FA off for anyone holding just an access token.
  if (await hasTotp(userId)) {
    throw new AppError("CONFLICT", "2FA is already enabled — disable it with a valid code first");
  }
  const secret = new Secret({ size: 20 });
  await prisma.credential.upsert({
    where: { userId_kind: { userId, kind: "TOTP" } },
    create: { userId, kind: "TOTP", secretHash: "", params: { secret: secret.base32, pending: true } },
    update: { secretHash: "", params: { secret: secret.base32, pending: true } },
  });
  return { uri: totpFor(label, secret.base32).toString(), secret: secret.base32 };
}

export async function confirmTotp(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
  const c = await prisma.credential.findUnique({ where: { userId_kind: { userId, kind: "TOTP" } } });
  const p = (c?.params as { secret?: string; pending?: boolean } | null) ?? {};
  if (!c || !p.secret) throw new AppError("VALIDATION", "2FA enrollment not started");
  if (totpFor(userId, p.secret).validate({ token: code, window: 1 }) === null) {
    throw new AppError("INVALID_OTP", "Incorrect 2FA code");
  }
  const plain = Array.from({ length: 10 }, () => numericCode(10));
  await prisma.$transaction([
    prisma.credential.update({ where: { id: c.id }, data: { params: { secret: p.secret, pending: false } } }),
    prisma.credential.upsert({
      where: { userId_kind: { userId, kind: "RECOVERY" } },
      create: { userId, kind: "RECOVERY", secretHash: "", params: { codes: plain.map(sha256Hex) } },
      update: { params: { codes: plain.map(sha256Hex) } },
    }),
  ]);
  return { recoveryCodes: plain };
}

export const hasTotp = (userId: string) =>
  prisma.credential
    .findUnique({ where: { userId_kind: { userId, kind: "TOTP" } } })
    .then((c) => Boolean(c) && (c!.params as { pending?: boolean } | null)?.pending !== true);

/** Accepts a TOTP code or an unused recovery code (which it then consumes). */
export async function verifyTotp(userId: string, code: string): Promise<boolean> {
  const c = await prisma.credential.findUnique({ where: { userId_kind: { userId, kind: "TOTP" } } });
  const p = (c?.params as { secret?: string; pending?: boolean } | null) ?? {};
  if (!c || !p.secret || p.pending) return false;
  if (totpFor(userId, p.secret).validate({ token: code.replace(/\s/g, ""), window: 1 }) !== null) return true;

  // recovery code (single-use — consumed from the array)
  const rec = await prisma.credential.findUnique({ where: { userId_kind: { userId, kind: "RECOVERY" } } });
  const codes = ((rec?.params as { codes?: string[] } | null)?.codes ?? []);
  const hashed = sha256Hex(code.replace(/\s/g, ""));
  if (rec && codes.includes(hashed)) {
    await prisma.credential.update({
      where: { id: rec.id },
      data: { params: { codes: codes.filter((h) => h !== hashed) } },
    });
    return true;
  }
  return false;
}

export async function disableTotp(userId: string): Promise<void> {
  await prisma.credential.deleteMany({ where: { userId, kind: { in: ["TOTP", "RECOVERY"] } } });
}
