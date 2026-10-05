import { prisma, type OtpChannel, type OtpPurpose } from "@stall/db";
import { env } from "@stall/config";
import { hashSecret, numericCode, verifySecret } from "../crypto.ts";
import { AppError } from "../errors.ts";
import { rateLimit } from "../redis.ts";

/**
 * Per-target ceilings, independent of caller IP (IPs rotate cheaply):
 * issuing caps SMS-pumping / toll fraud against one number, and verifying caps
 * total guesses per number across every code it is sent (each code also has
 * its own OTP_MAX_ATTEMPTS lockout).
 */
const ISSUE_PER_TARGET = { limit: 6, windowSec: 3600 };
const VERIFY_PER_TARGET = { limit: 20, windowSec: 3600 };

const normPhone = (p: string) => p.replace(/[^\d+]/g, "");
const normTarget = (t: string, ch: OtpChannel) =>
  ch === "SMS" ? normPhone(t) : t.trim().toLowerCase();

export interface IssueOtpInput {
  target: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  userId?: string;
}

/** Creates an OTP row and returns the plaintext code for the caller to deliver. */
export async function issueOtp(input: IssueOtpInput): Promise<{ code: string; expiresAt: Date }> {
  const target = normTarget(input.target, input.channel);

  const rl = await rateLimit(`otp:issue:${target}`, ISSUE_PER_TARGET.limit, ISSUE_PER_TARGET.windowSec);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many codes requested for this number — try again later", { retryAfterSec: rl.resetSec });

  const recent = await prisma.otp.findFirst({
    where: { target, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    const ageSec = (Date.now() - recent.createdAt.getTime()) / 1000;
    if (ageSec < env.OTP_RESEND_COOLDOWN_SECONDS) {
      throw new AppError(
        "OTP_COOLDOWN",
        `Wait ${Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - ageSec)}s before requesting another code`,
      );
    }
  }

  const code = numericCode(env.OTP_LENGTH);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

  await prisma.otp.create({
    data: {
      target,
      channel: input.channel,
      codeHash: await hashSecret(code),
      purpose: input.purpose,
      userId: input.userId ?? null,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt,
    },
  });

  return { code, expiresAt };
}

export interface VerifyOtpInput {
  target: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  code: string;
}

/** Verifies the newest live OTP for (target, purpose). Consumes it on success. */
export async function verifyOtp(input: VerifyOtpInput): Promise<{ userId: string | null }> {
  const target = normTarget(input.target, input.channel);

  const rl = await rateLimit(`otp:verify:${target}`, VERIFY_PER_TARGET.limit, VERIFY_PER_TARGET.windowSec);
  if (!rl.ok) throw new AppError("OTP_LOCKED", "Too many attempts — try again later", { retryAfterSec: rl.resetSec });

  const otp = await prisma.otp.findFirst({
    where: { target, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new AppError("INVALID_OTP", "No pending code for this target");
  if (otp.expiresAt.getTime() < Date.now()) throw new AppError("OTP_EXPIRED", "Code has expired");
  if (otp.attempts >= otp.maxAttempts) throw new AppError("OTP_LOCKED", "Too many attempts — request a new code");

  // Claim an attempt atomically BEFORE the (slow) hash check — a read-then-
  // increment let parallel requests all see attempts=0 and bypass the lockout.
  const claimed = await prisma.otp.updateMany({
    where: { id: otp.id, consumedAt: null, attempts: { lt: otp.maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) throw new AppError("OTP_LOCKED", "Too many attempts — request a new code");

  const ok = await verifySecret(otp.codeHash, input.code.trim());
  if (!ok) throw new AppError("INVALID_OTP", "Incorrect code");

  // Single-use: only one concurrent verifier may consume the code.
  const consumed = await prisma.otp.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) throw new AppError("INVALID_OTP", "Code already used");
  return { userId: otp.userId };
}
