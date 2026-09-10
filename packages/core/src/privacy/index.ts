/**
 * GDPR / CCPA data-subject pipeline (Phase 8).
 *
 *  - `exportMyData`           — portable JSON bundle of everything tied to the user
 *  - `requestAccountDeletion` — enters a cancellable grace period
 *  - `processDueDeletions`    — worker: anonymise PII, revoke access, tombstone
 *  - `purgeStaleAuditLogs`    — data-retention sweep
 *
 * Financial records (orders, ledger entries, payouts, invoices) are RETAINED for
 * legal/accounting reasons but stripped of directly-identifying data.
 */
import { prisma, Prisma } from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { notify } from "../comms/notifications.ts";

export async function exportMyData(userId: string) {
  const [user, orders, walletRow, walletTxns, addresses, reviews, deliveries, tickets, referrals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, email: true, firstName: true, lastName: true, locale: true, createdAt: true, roles: { select: { role: true, status: true } } },
    }),
    prisma.order.findMany({ where: { customerId: userId }, select: { number: true, status: true, totalMinor: true, currency: true, createdAt: true } }),
    prisma.wallet.findUnique({ where: { userId }, select: { id: true, currency: true } }),
    prisma.walletTransaction.findMany({ where: { wallet: { userId } }, select: { directionLabel: true, amountMinor: true, description: true, at: true }, orderBy: { at: "desc" }, take: 500 }),
    prisma.address.findMany({ where: { userId }, select: { label: true, line1: true, city: true, region: true, country: true } }),
    prisma.productReview.findMany({ where: { userId }, select: { rating: true, body: true, createdAt: true } }),
    prisma.delivery.findMany({ where: { customerId: userId }, select: { code: true, status: true, createdAt: true } }),
    prisma.auctionTicket.count({ where: { userId } }),
    prisma.referral.findMany({ where: { referrerId: userId }, select: { status: true, rewardMinor: true, createdAt: true } }),
  ]);
  if (!user) throw new AppError("NOT_FOUND", "User not found");
  return {
    generatedAt: new Date().toISOString(),
    profile: user,
    orders,
    wallet: walletRow ? { currency: walletRow.currency, transactions: walletTxns } : null,
    addresses,
    reviews,
    deliveries,
    auctionTicketsPurchased: tickets,
    referrals,
  };
}

export async function getAccountDeletionStatus(userId: string) {
  const r = await prisma.accountDeletionRequest.findUnique({ where: { userId } });
  if (!r) return { status: "none" as const };
  return {
    status: r.status,
    requestedAt: r.requestedAt.toISOString(),
    purgeAfter: r.purgeAfter.toISOString(),
    canCancel: r.status === "GRACE_PERIOD" || r.status === "REQUESTED",
  };
}

export async function requestAccountDeletion(userId: string, reason?: string) {
  const existing = await prisma.accountDeletionRequest.findUnique({ where: { userId } });
  if (existing && !["CANCELLED"].includes(existing.status)) {
    throw new AppError("CONFLICT", "A deletion request is already in progress");
  }
  const openOrders = await prisma.order.count({ where: { customerId: userId, status: { in: ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PARTIALLY_FULFILLED"] } } });
  if (openOrders > 0) throw new AppError("CONFLICT", "Finish or cancel your open orders first");

  const purgeAfter = new Date(Date.now() + env.ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
  const r = await prisma.accountDeletionRequest.upsert({
    where: { userId },
    create: { userId, reason, status: "GRACE_PERIOD", purgeAfter },
    update: { reason, status: "GRACE_PERIOD", purgeAfter, requestedAt: new Date(), processedAt: null, report: Prisma.JsonNull },
  });
  await prisma.auditLog.create({ data: { actorId: userId, actorType: "USER", action: "account.deletion_requested", targetType: "User", targetId: userId, after: { purgeAfter: purgeAfter.toISOString() } } });
  await notify({
    userId,
    category: "SECURITY",
    title: "Account deletion scheduled",
    body: `Your account will be permanently deleted after ${purgeAfter.toDateString()}. Sign in before then to cancel.`,
    data: { purgeAfter: purgeAfter.toISOString() },
  }).catch(() => {});
  return getAccountDeletionStatus(userId);
}

export async function cancelAccountDeletion(userId: string) {
  const r = await prisma.accountDeletionRequest.findUnique({ where: { userId } });
  if (!r || !["GRACE_PERIOD", "REQUESTED"].includes(r.status)) {
    throw new AppError("CONFLICT", "There's no cancellable deletion request");
  }
  await prisma.accountDeletionRequest.update({ where: { userId }, data: { status: "CANCELLED" } });
  await prisma.auditLog.create({ data: { actorId: userId, actorType: "USER", action: "account.deletion_cancelled", targetType: "User", targetId: userId } });
  return { status: "cancelled" as const };
}

/** Worker: anonymise + tombstone every request whose grace period has elapsed. */
export async function processDueDeletions() {
  const due = await prisma.accountDeletionRequest.findMany({
    where: { status: "GRACE_PERIOD", purgeAfter: { lte: new Date() } },
    take: 20,
  });
  let processed = 0;
  for (const req of due) {
    try {
      await anonymiseUser(req.userId);
      await prisma.accountDeletionRequest.update({
        where: { userId: req.userId },
        data: { status: "COMPLETED", processedAt: new Date(), report: { anonymisedAt: new Date().toISOString(), retained: ["orders", "ledger", "invoices"] } as Prisma.InputJsonValue },
      });
      processed++;
    } catch (e) {
      console.error("[account-deletion] failed for", req.userId, e);
    }
  }
  return { processed };
}

async function anonymiseUser(userId: string) {
  const tag = `deleted_${userId.slice(-10)}`;
  await prisma.$transaction(async (tx) => {
    // 1) revoke all access
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "account-deleted" } });
    await tx.tokenEpoch.upsert({ where: { userId }, create: { userId, ver: 2 }, update: { ver: { increment: 1 } } });
    await tx.credential.deleteMany({ where: { userId } });
    await tx.device.deleteMany({ where: { userId } });
    await tx.socialIdentity.deleteMany({ where: { userId } });
    await tx.otp.deleteMany({ where: { userId } });
    await tx.loginActivity.deleteMany({ where: { userId } });

    // 2) scrub directly-identifying profile data
    await tx.user.update({
      where: { id: userId },
      data: {
        // guaranteed-unique tombstone value (phone is @unique)
        phone: `deleted:${userId}`,
        email: null,
        firstName: null,
        lastName: null,
        avatar: null,
        status: "BANNED",
        deletedAt: new Date(),
      },
    });
    // addresses may be referenced by retained orders — scrub in place
    await tx.address.updateMany({
      where: { userId },
      data: { label: null, recipientName: "[removed]", phone: "[removed]", line1: "[removed]", line2: null, postalCode: null, deletedAt: new Date() },
    });
    await tx.savedLocation.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });

    // 3) detach PII from retained records
    await tx.productReview.updateMany({ where: { userId }, data: { body: "[removed]" } });
    await tx.productQuestion.updateMany({ where: { userId }, data: { body: "[removed]" } });

    // 4) mark deletion "done" on any related profiles
    await tx.vendorProfile.updateMany({ where: { userId }, data: { deletedAt: new Date(), displayName: tag } });
    await tx.courierProfile.updateMany({ where: { userId }, data: { deletedAt: new Date() } });

    await tx.auditLog.create({ data: { actorType: "SYSTEM", action: "account.anonymised", targetType: "User", targetId: userId } });
  });
}

/** Data-retention sweep for the audit log. */
export async function purgeStaleAuditLogs() {
  const cutoff = new Date(Date.now() - env.AUDIT_LOG_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.auditLog.deleteMany({ where: { at: { lt: cutoff } } });
  return { pruned: count };
}
