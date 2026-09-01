import { prisma, type OtpChannel, type OtpPurpose } from "@stall/db";
import { env } from "@stall/config";
import { hashSecret, numericCode, verifySecret } from "../crypto.ts";
import { AppError } from "../errors.ts";

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

  const otp = await prisma.otp.findFirst({
    where: { target, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new AppError("INVALID_OTP", "No pending code for this target");
  if (otp.expiresAt.getTime() < Date.now()) throw new AppError("OTP_EXPIRED", "Code has expired");
  if (otp.attempts >= otp.maxAttempts) throw new AppError("OTP_LOCKED", "Too many attempts — request a new code");

  const ok = await verifySecret(otp.codeHash, input.code.trim());
  if (!ok) {
    await prisma.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AppError("INVALID_OTP", "Incorrect code");
  }

  await prisma.otp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return { userId: otp.userId };
}
