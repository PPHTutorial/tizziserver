/**
 * Prize flow — claim → KYC verify → fulfilment (physical prizes reuse the
 * Phase-4 `Delivery` pipeline) — plus the winner's discounted `winTarget` buy
 * and non-winner voucher redemption.
 */
import { prisma, type Prisma, type PrizeFulfilMethod } from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { gatewayClearing, platformEscrow, platformRevenue, postTxn, userWallet } from "../wallet/ledger.ts";
import { getOrCreateWallet, walletBalanceMinor } from "../wallet/wallet.ts";
import { gatewayFor } from "../payments/providers.ts";
import { createDelivery } from "../delivery/deliveries.ts";
import { deliveryPricingConfig } from "../delivery/pricing.ts";

async function winnerFor(userId: string, auctionSlug: string) {
  const auction = await prisma.auction.findUnique({ where: { slug: auctionSlug }, include: { assets: true, draw: true } });
  if (!auction) throw new AppError("NOT_FOUND", "Auction not found");
  if (!auction.draw) throw new AppError("CONFLICT", "The draw hasn't run yet");
  const winner = await prisma.winner.findFirst({
    where: { drawId: auction.draw.id, participant: { userId } },
    include: { claim: { include: { fulfilments: true } }, winTarget: true },
  });
  return { auction, winner };
}

export async function getMyWin(userId: string, auctionSlug: string) {
  const { auction, winner } = await winnerFor(userId, auctionSlug);
  if (!winner) {
    // maybe a backup
    const backup = auction.draw
      ? await prisma.backupWinner.findFirst({ where: { drawId: auction.draw.id, participant: { userId } } })
      : null;
    // Runner-up standing — Figma's "Your Position: #N ... 3 tickets (Score:
    // 72/100)" — only meaningful once the draw has actually run.
    const participant = auction.draw
      ? await prisma.auctionParticipant.findFirst({
          where: { auctionId: auction.id, userId },
          select: { rank: true, qualificationScore: true, ticketCount: true },
        })
      : null;
    return {
      isWinner: false as const,
      isBackup: !!backup,
      backupOrder: backup?.order ?? null,
      auctionStatus: auction.status,
      myRank: participant?.rank ?? null,
      myScore: participant?.qualificationScore ?? null,
      myTicketCount: participant?.ticketCount ?? null,
    };
  }
  return {
    isWinner: true as const,
    winnerStatus: winner.status,
    assetTitle: auction.assets[0]?.title ?? auction.title,
    retailValueMinor: auction.retailValueMinor,
    winTargetMinor: auction.winTargetMinor,
    currency: auction.currency,
    claim: winner.claim
      ? {
          id: winner.claim.id,
          status: winner.claim.status,
          kycCaseId: winner.claim.kycCaseId,
          deliveryId: winner.claim.deliveryId,
          fulfilments: winner.claim.fulfilments.map((f) => ({ method: f.method, completedAt: f.completedAt?.toISOString() ?? null })),
        }
      : null,
    winTargetPurchase: winner.winTarget ? { status: winner.winTarget.status, amountMinor: winner.winTarget.amountMinor, orderId: winner.winTarget.orderId, deliveryId: winner.winTarget.deliveryId } : null,
  };
}

export async function startPrizeClaim(userId: string, auctionSlug: string) {
  const { winner } = await winnerFor(userId, auctionSlug);
  if (!winner) throw new AppError("FORBIDDEN", "You're not the winner of this draw");
  if (winner.status === "FORFEITED") throw new AppError("CONFLICT", "This win was forfeited");
  const claim = await prisma.prizeClaim.upsert({
    where: { winnerId: winner.id },
    create: { winnerId: winner.id, status: "OPEN" },
    update: {},
  });
  return { claimId: claim.id, status: claim.status };
}

export async function submitClaimKyc(userId: string, claimId: string, input: { documents: { type: string; fileKey: string }[] }) {
  const claim = await prisma.prizeClaim.findFirst({ where: { id: claimId, winner: { participant: { userId } } } });
  if (!claim) throw new AppError("NOT_FOUND", "Claim not found");
  const kyc = await prisma.kycCase.upsert({
    where: { subjectType_subjectId: { subjectType: "USER", subjectId: userId } },
    create: { subjectType: "USER", subjectId: userId, level: "FULL", status: "IN_REVIEW" },
    update: { status: "IN_REVIEW" },
  });
  await prisma.$transaction([
    ...input.documents.map((d) => prisma.kycDocument.create({ data: { kycCaseId: kyc.id, type: (d.type as never) ?? "OTHER", fileKey: d.fileKey } })),
    prisma.prizeClaim.update({ where: { id: claimId }, data: { status: "VERIFYING", kycCaseId: kyc.id } }),
  ]);
  return { claimId, status: "VERIFYING" as const, kycCaseId: kyc.id };
}

/** STAFF/ADMIN. APPROVE → CLAIMED; REJECT → FORFEITED + promote backup #1. */
export async function reviewPrizeClaim(reviewerId: string, claimId: string, decision: "APPROVE" | "REJECT", note?: string) {
  const claim = await prisma.prizeClaim.findUnique({ where: { id: claimId }, include: { winner: { include: { draw: true } } } });
  if (!claim) throw new AppError("NOT_FOUND", "Claim not found");

  if (decision === "APPROVE") {
    await prisma.$transaction([
      prisma.prizeClaim.update({ where: { id: claimId }, data: { status: "APPROVED", note } }),
      prisma.winner.update({ where: { id: claim.winnerId }, data: { status: "CLAIMED" } }),
      ...(claim.kycCaseId
        ? [prisma.kycCase.updateMany({ where: { id: claim.kycCaseId }, data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: new Date() } })]
        : []),
    ]);
    return { claimId, status: "APPROVED" as const };
  }

  // reject → forfeit + promote the first backup to a new PENDING_CLAIM winner
  const backup = await prisma.backupWinner.findFirst({ where: { drawId: claim.winner.drawId }, orderBy: { order: "asc" } });
  await prisma.$transaction(async (tx) => {
    await tx.prizeClaim.update({ where: { id: claimId }, data: { status: "REJECTED", note } });
    await tx.winner.update({ where: { id: claim.winnerId }, data: { status: "FORFEITED" } });
    if (backup) {
      await tx.winner.create({ data: { drawId: claim.winner.drawId, participantId: backup.participantId, position: "PRIMARY", assetId: claim.winner.assetId, status: "PENDING_CLAIM" } });
      await tx.backupWinner.delete({ where: { id: backup.id } });
      await tx.outboxEvent.create({ data: { type: "auction.backup_promoted", aggregateType: "Draw", aggregateId: claim.winner.drawId, payload: { participantId: backup.participantId } } });
    }
  });
  return { claimId, status: "REJECTED" as const, backupPromoted: !!backup };
}

export interface FulfilInput {
  method: PrizeFulfilMethod;
  dropoff?: { lat: number; lng: number; address: Record<string, unknown>; contactName?: string; contactPhone?: string };
}

export async function fulfilPrize(staffId: string, claimId: string, input: FulfilInput) {
  const claim = await prisma.prizeClaim.findUnique({
    where: { id: claimId },
    include: { winner: { include: { participant: { include: { user: true } }, draw: { include: { auction: { include: { assets: true } } } } } } },
  });
  if (!claim) throw new AppError("NOT_FOUND", "Claim not found");
  if (claim.status !== "APPROVED" && claim.status !== "FULFILLING") throw new AppError("CONFLICT", `Claim is ${claim.status}`);
  const auction = claim.winner.draw.auction;
  const winnerUser = claim.winner.participant.user;

  let deliveryId: string | undefined;
  if (input.method === "DELIVERY") {
    if (!input.dropoff) throw new AppError("VALIDATION", "A delivery address is required");
    const fee = env.AUCTION_PRIZE_DELIVERY_FEE_MINOR;
    const cfg = await deliveryPricingConfig(auction.platformSlug);
    const payout = Math.round((fee * cfg.courierShareBps) / 10_000);

    const { delivery } = await createDelivery({
      platformSlug: auction.platformSlug,
      sourceType: "AUCTION",
      sourceId: claimId,
      customerId: winnerUser.id,
      pickup: {
        lat: env.AUCTION_WAREHOUSE_LAT,
        lng: env.AUCTION_WAREHOUSE_LNG,
        address: { name: "Stall Prize Warehouse" },
        contact: { name: "Prize desk", phone: "+233200000999" },
      },
      dropoff: {
        lat: input.dropoff.lat,
        lng: input.dropoff.lng,
        address: input.dropoff.address,
        contact: {
          name: input.dropoff.contactName ?? ([winnerUser.firstName, winnerUser.lastName].filter(Boolean).join(" ") || "Winner"),
          phone: input.dropoff.contactPhone ?? winnerUser.phone,
        },
      },
      items: [{ description: auction.assets[0]?.title ?? auction.title, qty: 1, fragile: true }],
      autoDispatch: false,
    });
    deliveryId = delivery.id;

    // platform-funded: pre-fund platform escrow so completeDelivery settles normally
    await prisma.delivery.update({ where: { id: deliveryId }, data: { feeMinor: fee, courierPayoutMinor: payout } });
    await prisma.deliveryJob.updateMany({ where: { deliveryId }, data: { payoutMinor: payout } });
    if (fee > 0) {
      await postTxn({
        type: "HOLD",
        memo: `Prize delivery funding — ${auction.slug}`,
        reference: { claimId, deliveryId },
        lines: [
          { account: platformRevenue(auction.platformSlug, auction.currency), direction: "DEBIT", amountMinor: fee },
          { account: platformEscrow(auction.platformSlug, auction.currency), direction: "CREDIT", amountMinor: fee },
        ],
      });
    }
    const { dispatchDelivery } = await import("../delivery/dispatch.ts");
    await dispatchDelivery(deliveryId).catch((e) => console.error("[prize] dispatch", e));
  }

  if (input.method === "PAYOUT") {
    await getOrCreateWallet(winnerUser.id, auction.currency);
    await postTxn({
      type: "ADJUSTMENT",
      memo: `Prize cash-out — ${auction.slug}`,
      reference: { claimId },
      lines: [
        { account: platformRevenue(auction.platformSlug, auction.currency), direction: "DEBIT", amountMinor: auction.winTargetMinor },
        { account: userWallet(winnerUser.id, auction.currency), direction: "CREDIT", amountMinor: auction.winTargetMinor },
      ],
    });
  }

  await prisma.$transaction([
    prisma.prizeFulfilment.create({ data: { claimId, method: input.method, ref: { deliveryId, by: staffId } as Prisma.InputJsonValue, completedAt: input.method === "DELIVERY" ? null : new Date() } }),
    prisma.prizeClaim.update({
      where: { id: claimId },
      data: { status: input.method === "DELIVERY" ? "FULFILLING" : "DELIVERED", deliveryId },
    }),
    prisma.outboxEvent.create({ data: { type: "auction.prize_fulfilment", aggregateType: "PrizeClaim", aggregateId: claimId, payload: { method: input.method, deliveryId } } }),
  ]);

  return { claimId, status: input.method === "DELIVERY" ? "FULFILLING" : "DELIVERED", deliveryId: deliveryId ?? null };
}

/** The winner buys the item at the low `winTargetMinor`. */
export async function purchaseWinTarget(userId: string, auctionSlug: string, payment: { method: "wallet" | "gateway"; gateway?: string }) {
  const { auction, winner } = await winnerFor(userId, auctionSlug);
  if (!winner) throw new AppError("FORBIDDEN", "You're not the winner of this draw");
  if (winner.status === "FORFEITED") throw new AppError("CONFLICT", "This win was forfeited");
  if (winner.winTarget && winner.winTarget.status === "PAID") throw new AppError("CONFLICT", "Already purchased");

  const amountMinor = auction.winTargetMinor;
  const pi = await prisma.paymentIntent.create({
    data: { userId, purpose: "ORDER", amountMinor, currency: auction.currency, status: "PROCESSING", gateway: payment.method === "wallet" ? "wallet" : gatewayFor(payment.gateway).name, metadata: { auctionId: auction.id, winTarget: true } as Prisma.InputJsonValue },
  });

  if (payment.method === "wallet") {
    await getOrCreateWallet(userId, auction.currency);
    const bal = await walletBalanceMinor(userId, auction.currency);
    if (bal < amountMinor) throw new AppError("INSUFFICIENT_FUNDS", "Wallet balance is too low", { balanceMinor: bal, requiredMinor: amountMinor });
    await prisma.$transaction(async (tx) => {
      const txn = await postTxn(
        {
          type: "ORDER_CAPTURE",
          memo: `Win purchase — ${auction.slug}`,
          reference: { auctionId: auction.id, paymentIntentId: pi.id },
          lines: [
            { account: userWallet(userId, auction.currency), direction: "DEBIT", amountMinor },
            { account: platformRevenue(auction.platformSlug, auction.currency), direction: "CREDIT", amountMinor },
          ],
        },
        tx,
      );
      const w = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const balanceAfter = (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: w.accountId } })).balanceMinor;
      await tx.walletTransaction.create({ data: { walletId: w.id, ledgerTxnId: txn.id, directionLabel: "debit", amountMinor, balanceAfterMinor: balanceAfter, description: `Win purchase — ${auction.title}` } });
      await tx.paymentIntent.update({ where: { id: pi.id }, data: { status: "SUCCEEDED" } });
    });
  } else {
    const gw = gatewayFor(payment.gateway);
    const intent = await gw.createIntent({ amountMinor, currency: auction.currency, purpose: "ORDER", reference: pi.id, userId });
    const cap = await gw.capture(intent.ref, amountMinor);
    if (!cap.ok) {
      await prisma.paymentIntent.update({ where: { id: pi.id }, data: { status: "FAILED" } });
      throw new AppError("PAYMENT_FAILED", "Payment was declined");
    }
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({ data: { intentId: pi.id, status: "SUCCEEDED", capturedMinor: cap.capturedMinor, feeMinor: cap.feeMinor, processedAt: new Date() } });
      await tx.paymentIntent.update({ where: { id: pi.id }, data: { status: "SUCCEEDED", gatewayRef: intent.ref } });
      await postTxn(
        {
          type: "ORDER_CAPTURE",
          memo: `Win purchase — ${auction.slug} (${gw.name})`,
          reference: { auctionId: auction.id, paymentIntentId: pi.id },
          lines: [
            { account: gatewayClearing(auction.platformSlug, auction.currency), direction: "DEBIT", amountMinor },
            { account: platformRevenue(auction.platformSlug, auction.currency), direction: "CREDIT", amountMinor },
          ],
        },
        tx,
      );
    });
  }

  const wt = await prisma.winTargetPurchase.upsert({
    where: { winnerId: winner.id },
    create: { winnerId: winner.id, userId, amountMinor, currency: auction.currency, paymentIntentId: pi.id, status: "PAID" },
    update: { status: "PAID", paymentIntentId: pi.id },
  });
  await prisma.outboxEvent.create({ data: { type: "auction.win_purchased", aggregateType: "Auction", aggregateId: auction.id, payload: { userId, amountMinor } } });
  return { id: wt.id, status: "PAID" as const, amountMinor };
}
