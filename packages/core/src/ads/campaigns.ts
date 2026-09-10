/**
 * Vendor advertising campaigns.
 *
 * Lifecycle: DRAFT → (submit) → PENDING_REVIEW → (staff approve) → SCHEDULED/ACTIVE
 *            → (budget spent | endsAt) → COMPLETED.  PAUSED / CANCELLED / REJECTED are terminal-ish.
 *
 * Money: on activation the full `budgetMinor` is charged (wallet or gateway) into
 * platform escrow as an ad prepay. `AdEvent`s accrue `spentMinor`; on COMPLETED /
 * CANCELLED the spent portion is released to platform REVENUE and the remainder
 * refunded to the vendor wallet — reconciled to the cent.
 */
import { prisma, type Prisma, type CampaignObjective, type CampaignStatus } from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import {
  gatewayClearing,
  platformEscrow,
  platformRevenue,
  postTxn,
  userWallet,
} from "../wallet/ledger.ts";
import { getOrCreateWallet, refundToWallet, walletBalanceMinor } from "../wallet/wallet.ts";
import { gatewayFor } from "../payments/providers.ts";
import { getBoostTier } from "./tiers.ts";

const CUR = "GHS";

export interface CreateCampaignInput {
  vendorId: string;
  platformSlug: string;
  name: string;
  objective?: CampaignObjective;
  boostTierKey?: string;
  budgetMinor: number;
  dailyCapMinor?: number;
  productIds?: string[];
  targeting?: { categoryIds?: string[]; regionCodes?: string[]; keywords?: string[] };
  startsAt?: Date;
  endsAt?: Date;
}

export async function createCampaign(input: CreateCampaignInput) {
  if (input.budgetMinor < env.ADS_MIN_BUDGET_MINOR) {
    throw new AppError("VALIDATION", `Minimum budget is ${env.ADS_MIN_BUDGET_MINOR} minor units`);
  }
  const tier = input.boostTierKey ? await getBoostTier(input.boostTierKey) : null;
  if (tier && !tier.platformSlugs.includes(input.platformSlug)) {
    throw new AppError("VALIDATION", "That tier isn't available on this platform");
  }
  const c = await prisma.campaign.create({
    data: {
      vendorId: input.vendorId,
      platformSlug: input.platformSlug,
      name: input.name,
      objective: input.objective ?? "PRODUCT_SALES",
      boostTierId: tier?.id,
      budgetMinor: input.budgetMinor,
      dailyCapMinor: input.dailyCapMinor,
      targeting: (input.targeting ?? undefined) as Prisma.InputJsonValue,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      items: input.productIds?.length
        ? { create: [...new Set(input.productIds)].map((productId) => ({ productId })) }
        : undefined,
    },
    include: { items: true },
  });
  return shapeCampaign(c);
}

export async function updateCampaign(vendorId: string, campaignId: string, patch: Partial<CreateCampaignInput>) {
  const c = await mustOwn(vendorId, campaignId);
  if (!["DRAFT", "REJECTED"].includes(c.status)) throw new AppError("CONFLICT", "Only a draft campaign can be edited");
  const tier = patch.boostTierKey ? await getBoostTier(patch.boostTierKey) : undefined;
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      name: patch.name,
      objective: patch.objective,
      boostTierId: tier?.id,
      budgetMinor: patch.budgetMinor,
      dailyCapMinor: patch.dailyCapMinor,
      targeting: patch.targeting !== undefined ? (patch.targeting as Prisma.InputJsonValue) : undefined,
      startsAt: patch.startsAt,
      endsAt: patch.endsAt,
      status: c.status === "REJECTED" ? "DRAFT" : undefined,
    },
    include: { items: true },
  });
  return shapeCampaign(updated);
}

export async function setCampaignProducts(vendorId: string, campaignId: string, productIds: string[]) {
  const c = await mustOwn(vendorId, campaignId);
  if (!["DRAFT", "REJECTED"].includes(c.status)) throw new AppError("CONFLICT", "Only a draft campaign can be edited");
  await prisma.$transaction([
    prisma.campaignItem.deleteMany({ where: { campaignId } }),
    prisma.campaignItem.createMany({ data: [...new Set(productIds)].map((productId) => ({ campaignId, productId })) }),
  ]);
  return { count: new Set(productIds).size };
}

/** Submit for review (or activate straight away when review isn't required). Charges the budget. */
export async function submitCampaign(
  vendorId: string,
  campaignId: string,
  payment: { method: "wallet" | "gateway"; gateway?: string },
) {
  const c = await mustOwn(vendorId, campaignId);
  if (!["DRAFT", "REJECTED"].includes(c.status)) throw new AppError("CONFLICT", `Campaign is ${c.status.toLowerCase()}`);
  const items = await prisma.campaignItem.count({ where: { campaignId } });
  if (items === 0) throw new AppError("VALIDATION", "Add at least one product to promote");

  await chargeBudget(c.vendorId, c.platformSlug, c.id, c.budgetMinor, payment);

  const needsReview = env.ADS_REVIEW_REQUIRED;
  const startsAt = c.startsAt && c.startsAt > new Date() ? c.startsAt : new Date();
  const updated = await prisma.campaign.update({
    where: { id: c.id },
    data: needsReview
      ? { status: "PENDING_REVIEW", submittedAt: new Date() }
      : { status: c.startsAt && c.startsAt > new Date() ? "SCHEDULED" : "ACTIVE", submittedAt: new Date(), startsAt },
    include: { items: true },
  });
  await prisma.outboxEvent.create({
    data: { type: "campaign.submitted", aggregateType: "Campaign", aggregateId: c.id, payload: { vendorId, budgetMinor: c.budgetMinor, needsReview } },
  });
  return shapeCampaign(updated);
}

async function chargeBudget(
  vendorId: string,
  platformSlug: string,
  campaignId: string,
  amountMinor: number,
  payment: { method: "wallet" | "gateway"; gateway?: string },
) {
  const pi = await prisma.paymentIntent.create({
    data: {
      userId: vendorId,
      purpose: "CAMPAIGN",
      amountMinor,
      currency: CUR,
      status: "PROCESSING",
      gateway: payment.method === "wallet" ? "wallet" : gatewayFor(payment.gateway).name,
      metadata: { campaignId, kind: "ad_prepay" } as Prisma.InputJsonValue,
    },
  });
  try {
    if (payment.method === "wallet") {
      await getOrCreateWallet(vendorId);
      const bal = await walletBalanceMinor(vendorId);
      if (bal < amountMinor) throw new AppError("INSUFFICIENT_FUNDS", "Wallet balance is too low", { balanceMinor: bal, requiredMinor: amountMinor });
      await prisma.$transaction(async (tx) => {
        const txn = await postTxn(
          {
            type: "HOLD",
            memo: `Ad budget · campaign ${campaignId}`,
            reference: { campaignId, paymentIntentId: pi.id },
            lines: [
              { account: userWallet(vendorId), direction: "DEBIT", amountMinor },
              { account: platformEscrow(platformSlug), direction: "CREDIT", amountMinor },
            ],
          },
          tx,
        );
        const w = await tx.wallet.findUniqueOrThrow({ where: { userId: vendorId } });
        const after = (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: w.accountId } })).balanceMinor;
        await tx.walletTransaction.create({
          data: { walletId: w.id, ledgerTxnId: txn.id, directionLabel: "debit", amountMinor, balanceAfterMinor: after, description: "Ad campaign budget", meta: { campaignId } },
        });
        await tx.paymentIntent.update({ where: { id: pi.id }, data: { status: "SUCCEEDED" } });
        await tx.campaign.update({ where: { id: campaignId }, data: { paymentIntentId: pi.id } });
      });
    } else {
      const gw = gatewayFor(payment.gateway);
      const intent = await gw.createIntent({ amountMinor, currency: CUR, purpose: "OTHER", reference: pi.id, userId: vendorId });
      const cap = await gw.capture(intent.ref, amountMinor);
      if (!cap.ok) {
        await prisma.paymentIntent.update({ where: { id: pi.id }, data: { status: "FAILED" } });
        throw new AppError("PAYMENT_FAILED", cap.failureReason ? `Payment declined (${cap.failureReason})` : "Payment was declined");
      }
      await prisma.$transaction(async (tx) => {
        await tx.payment.create({ data: { intentId: pi.id, status: "SUCCEEDED", capturedMinor: cap.capturedMinor, feeMinor: cap.feeMinor, gatewayResponse: cap.raw as Prisma.InputJsonValue, processedAt: new Date() } });
        await tx.paymentIntent.update({ where: { id: pi.id }, data: { status: "SUCCEEDED", gatewayRef: intent.ref } });
        await postTxn(
          {
            type: "HOLD",
            memo: `Ad budget · campaign ${campaignId} (${gw.name})`,
            reference: { campaignId, paymentIntentId: pi.id, gatewayRef: intent.ref },
            lines: [
              { account: gatewayClearing(platformSlug), direction: "DEBIT", amountMinor },
              { account: platformEscrow(platformSlug), direction: "CREDIT", amountMinor },
            ],
          },
          tx,
        );
        await tx.campaign.update({ where: { id: campaignId }, data: { paymentIntentId: pi.id } });
      });
    }
  } catch (e) {
    await prisma.paymentIntent.update({ where: { id: pi.id }, data: { status: "FAILED" } }).catch(() => {});
    throw e;
  }
}

/** Release spent budget → REVENUE, refund the unspent remainder → vendor wallet. */
export async function settleCampaign(campaignId: string, finalStatus: "COMPLETED" | "CANCELLED") {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new AppError("NOT_FOUND", "Campaign not found");
  if (["COMPLETED", "CANCELLED"].includes(c.status)) return shapeCampaign(c);

  // Flip to a terminal state FIRST, guarded by the current status — this makes
  // settle idempotent: a retry after a partial failure hits the early return
  // above and can never re-release spend into REVENUE.
  const claimed = await prisma.campaign.updateMany({
    where: { id: campaignId, status: c.status },
    data: { status: finalStatus },
  });
  if (claimed.count === 0) return shapeCampaign((await prisma.campaign.findUnique({ where: { id: campaignId } }))!);

  const spent = Math.min(c.spentMinor, c.budgetMinor);
  const refund = c.budgetMinor - spent;
  const charged = c.paymentIntentId != null;

  if (charged && spent > 0) {
    await postTxn({
      type: "RELEASE",
      memo: `Ad spend settle · campaign ${campaignId}`,
      reference: { campaignId },
      lines: [
        { account: platformEscrow(c.platformSlug), direction: "DEBIT", amountMinor: spent },
        { account: platformRevenue(c.platformSlug), direction: "CREDIT", amountMinor: spent },
      ],
    });
  }
  if (charged && refund > 0) {
    await refundToWallet({
      userId: c.vendorId,
      amountMinor: refund,
      platformSlug: c.platformSlug,
      memo: `Ad budget refund · campaign ${campaignId}`,
      reference: { campaignId },
    });
  }
  await prisma.outboxEvent.create({
    data: { type: `campaign.${finalStatus.toLowerCase()}`, aggregateType: "Campaign", aggregateId: campaignId, payload: { spentMinor: spent, refundMinor: refund } },
  });
  return shapeCampaign((await prisma.campaign.findUnique({ where: { id: campaignId } }))!);
}

export async function pauseCampaign(vendorId: string, campaignId: string) {
  const c = await mustOwn(vendorId, campaignId);
  if (c.status !== "ACTIVE") throw new AppError("CONFLICT", "Only an active campaign can be paused");
  return shapeCampaign(await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } }));
}

export async function resumeCampaign(vendorId: string, campaignId: string) {
  const c = await mustOwn(vendorId, campaignId);
  if (c.status !== "PAUSED") throw new AppError("CONFLICT", "Only a paused campaign can be resumed");
  if (c.spentMinor >= c.budgetMinor) throw new AppError("CONFLICT", "Budget is exhausted — top up with a new campaign");
  const status = c.endsAt && c.endsAt < new Date() ? "COMPLETED" : "ACTIVE";
  return shapeCampaign(await prisma.campaign.update({ where: { id: campaignId }, data: { status } }));
}

export async function cancelCampaign(vendorId: string, campaignId: string) {
  const c = await mustOwn(vendorId, campaignId);
  if (["COMPLETED", "CANCELLED"].includes(c.status)) throw new AppError("CONFLICT", `Campaign is already ${c.status.toLowerCase()}`);
  if (c.paymentIntentId) return settleCampaign(campaignId, "CANCELLED");
  return shapeCampaign(await prisma.campaign.update({ where: { id: campaignId }, data: { status: "CANCELLED" } }));
}

// --- reads ----------------------------------------------------------

export async function listMyCampaigns(vendorId: string, opts: { status?: CampaignStatus } = {}) {
  const rows = await prisma.campaign.findMany({
    where: { vendorId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: "desc" },
    include: { items: true, boostTier: { select: { key: true, name: true, badge: true } } },
  });
  return { items: rows.map(shapeCampaign) };
}

export async function getCampaign(vendorId: string, campaignId: string) {
  const c = await prisma.campaign.findFirst({
    where: { id: campaignId, vendorId },
    include: { items: true, ads: true, boostTier: { select: { key: true, name: true, badge: true } } },
  });
  if (!c) throw new AppError("NOT_FOUND", "Campaign not found");
  const stat = await prisma.adEvent.groupBy({
    by: ["kind"],
    where: { campaignId },
    _count: { _all: true },
  });
  const by = (k: string) => stat.find((s) => s.kind === k)?._count._all ?? 0;
  const impressions = by("IMPRESSION");
  const clicks = by("CLICK");
  return {
    ...shapeCampaign(c),
    ads: c.ads.map((a) => ({
      id: a.id,
      slot: a.slot,
      creativeKind: a.creativeKind,
      headline: a.headline,
      subtext: a.subtext,
      imageKey: a.imageKey,
      productId: a.productId,
      destinationRoute: a.destinationRoute,
      weight: a.weight,
      isActive: a.isActive,
    })),
    performance: {
      impressions,
      clicks,
      conversions: by("CONVERSION"),
      ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : 0,
      spentMinor: c.spentMinor,
      budgetMinor: c.budgetMinor,
      remainingMinor: Math.max(0, c.budgetMinor - c.spentMinor),
    },
  };
}

// --- staff --------------------------------------------------------

export async function listReviewQueue() {
  const rows = await prisma.campaign.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { submittedAt: "asc" },
    include: { items: true, vendor: { select: { firstName: true, lastName: true } }, boostTier: { select: { name: true } } },
  });
  return {
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      objective: c.objective,
      vendor: `${c.vendor.firstName ?? ""} ${c.vendor.lastName ?? ""}`.trim() || "Vendor",
      platformSlug: c.platformSlug,
      budgetMinor: c.budgetMinor,
      tier: c.boostTier?.name ?? null,
      products: c.items.length,
      targeting: c.targeting,
      submittedAt: c.submittedAt?.toISOString() ?? null,
    })),
  };
}

export async function reviewCampaign(
  staffId: string,
  campaignId: string,
  decision: { approve: boolean; reason?: string },
) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new AppError("NOT_FOUND", "Campaign not found");
  if (c.status !== "PENDING_REVIEW") throw new AppError("CONFLICT", "Campaign isn't awaiting review");

  if (decision.approve) {
    const scheduled = c.startsAt && c.startsAt > new Date();
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: scheduled ? "SCHEDULED" : "ACTIVE", reviewedById: staffId, reviewedAt: new Date(), startsAt: scheduled ? c.startsAt : new Date() },
    });
    await prisma.outboxEvent.create({ data: { type: "campaign.approved", aggregateType: "Campaign", aggregateId: campaignId, payload: { vendorId: c.vendorId } } });
    return shapeCampaign(updated);
  }
  // rejected — refund the full budget
  if (c.paymentIntentId) {
    await refundToWallet({ userId: c.vendorId, amountMinor: c.budgetMinor, platformSlug: c.platformSlug, memo: `Ad budget refund · rejected ${campaignId}`, reference: { campaignId } });
  }
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "REJECTED", reviewedById: staffId, reviewedAt: new Date(), rejectionReason: decision.reason ?? "Did not meet advertising policy" },
  });
  await prisma.outboxEvent.create({ data: { type: "campaign.rejected", aggregateType: "Campaign", aggregateId: campaignId, payload: { vendorId: c.vendorId, reason: updated.rejectionReason } } });
  return shapeCampaign(updated);
}

// --- worker sweeps -----------------------------------------------

export async function activateDueCampaigns() {
  const due = await prisma.campaign.findMany({ where: { status: "SCHEDULED", startsAt: { lte: new Date() } }, select: { id: true } });
  for (const c of due) await prisma.campaign.update({ where: { id: c.id }, data: { status: "ACTIVE" } });
  return { activated: due.length };
}

export async function completeFinishedCampaigns() {
  const done = await prisma.campaign.findMany({
    where: { status: { in: ["ACTIVE", "PAUSED"] }, OR: [{ endsAt: { lte: new Date() } }, { spentMinor: { gte: prisma.campaign.fields.budgetMinor } }] },
    select: { id: true },
  });
  for (const c of done) await settleCampaign(c.id, "COMPLETED").catch((e) => console.error("[campaign settle]", c.id, e));
  return { completed: done.length };
}

// --- helpers ----------------------------------------------------

async function mustOwn(vendorId: string, campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.vendorId !== vendorId) throw new AppError("NOT_FOUND", "Campaign not found");
  return c;
}

function shapeCampaign(c: {
  id: string; name: string; objective: CampaignObjective; status: CampaignStatus; platformSlug: string;
  budgetMinor: number; spentMinor: number; dailyCapMinor: number | null; targeting: unknown;
  startsAt: Date | null; endsAt: Date | null; rejectionReason?: string | null; createdAt: Date;
  boostTierId?: string | null;
  items?: { productId: string }[];
  boostTier?: { key?: string; name: string; badge?: string | null } | null;
}) {
  return {
    id: c.id,
    name: c.name,
    objective: c.objective,
    status: c.status,
    platformSlug: c.platformSlug,
    budgetMinor: c.budgetMinor,
    spentMinor: c.spentMinor,
    dailyCapMinor: c.dailyCapMinor,
    targeting: c.targeting ?? null,
    productIds: c.items?.map((i) => i.productId) ?? [],
    tier: c.boostTier ? { key: c.boostTier.key ?? null, name: c.boostTier.name, badge: c.boostTier.badge ?? null } : null,
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    rejectionReason: c.rejectionReason ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}
