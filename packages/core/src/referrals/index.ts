/**
 * Referral programme. Each user gets a stable share code; a new user can apply
 * one at (or shortly after) sign-up, and the referrer is rewarded to their
 * wallet once the referee places a first qualifying order.
 */
import { prisma } from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { randomToken } from "../crypto.ts";
import { getOrCreateWallet, refundToWallet } from "../wallet/wallet.ts";
import { notify } from "../comms/notifications.ts";

function makeCode(): string {
  return randomToken(6).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8).padEnd(8, "X");
}

export async function getMyReferral(userId: string) {
  let rc = await prisma.referralCode.findUnique({ where: { userId } });
  if (!rc) {
    for (let i = 0; i < 5 && !rc; i++) {
      rc = await prisma.referralCode.create({ data: { userId, code: makeCode() } }).catch(() => null);
    }
    if (!rc) throw new AppError("INTERNAL", "Could not allocate a referral code");
  }
  const referrals = await prisma.referral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: "desc" } });
  const rewardedMinor = referrals.filter((r) => r.status === "REWARDED").reduce((s, r) => s + r.rewardMinor, 0);
  return {
    code: rc.code,
    rewardPerReferralMinor: env.REFERRAL_REWARD_MINOR,
    qualifyMinOrderMinor: env.REFERRAL_QUALIFY_MIN_ORDER_MINOR,
    counts: {
      pending: referrals.filter((r) => r.status === "PENDING").length,
      qualified: referrals.filter((r) => r.status === "QUALIFIED").length,
      rewarded: referrals.filter((r) => r.status === "REWARDED").length,
    },
    rewardedMinor,
    items: referrals.map((r) => ({ id: r.id, status: r.status, rewardMinor: r.rewardMinor, at: r.createdAt.toISOString(), rewardedAt: r.rewardedAt?.toISOString() ?? null })),
  };
}

export async function applyReferralCode(userId: string, code: string, channel?: string) {
  const rc = await prisma.referralCode.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!rc) throw new AppError("NOT_FOUND", "That referral code isn't valid");
  if (rc.userId === userId) throw new AppError("VALIDATION", "You can't use your own code");

  const existing = await prisma.referral.findUnique({ where: { refereeId: userId } });
  if (existing) throw new AppError("CONFLICT", "A referral code is already linked to this account");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  const graceMs = 7 * 86_400_000;
  if (user && Date.now() - user.createdAt.getTime() > graceMs) {
    throw new AppError("CONFLICT", "Referral codes can only be applied within 7 days of signing up");
  }

  const r = await prisma.referral.create({
    data: {
      referrerId: rc.userId,
      refereeId: userId,
      code: rc.code,
      channel,
      status: "PENDING",
      rewardMinor: env.REFERRAL_REWARD_MINOR,
      expiresAt: new Date(Date.now() + env.REFERRAL_EXPIRY_DAYS * 86_400_000),
    },
  });
  return { id: r.id, status: r.status };
}

/**
 * Called when an order reaches a paid/placed state. If the customer was referred
 * and this order qualifies, reward the referrer.
 */
export async function qualifyReferralForOrder(input: { customerId: string; orderId: string; orderTotalMinor: number; platformSlug: string }) {
  const r = await prisma.referral.findUnique({ where: { refereeId: input.customerId } });
  if (!r || r.status !== "PENDING") return { rewarded: false as const };
  if (r.expiresAt && r.expiresAt < new Date()) {
    await prisma.referral.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
    return { rewarded: false as const };
  }
  if (input.orderTotalMinor < env.REFERRAL_QUALIFY_MIN_ORDER_MINOR) return { rewarded: false as const };

  await prisma.referral.update({ where: { id: r.id }, data: { status: "QUALIFIED", qualifyingOrderId: input.orderId } });

  await getOrCreateWallet(r.referrerId);
  await refundToWallet({
    userId: r.referrerId,
    amountMinor: r.rewardMinor,
    platformSlug: input.platformSlug,
    memo: "Referral reward",
    reference: { referralId: r.id, orderId: input.orderId },
  });
  await prisma.referral.update({ where: { id: r.id }, data: { status: "REWARDED", rewardedAt: new Date() } });
  await notify({
    userId: r.referrerId,
    category: "COUPON",
    title: "Referral reward earned",
    body: `A friend you invited placed their first order — ${(r.rewardMinor / 100).toFixed(2)} is in your wallet.`,
    data: { referralId: r.id },
  }).catch(() => {});
  await prisma.outboxEvent.create({ data: { type: "referral.rewarded", aggregateType: "Referral", aggregateId: r.id, payload: { referrerId: r.referrerId, rewardMinor: r.rewardMinor } } });
  return { rewarded: true as const, rewardMinor: r.rewardMinor };
}

export async function expireStaleReferrals() {
  const { count } = await prisma.referral.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return { expired: count };
}
