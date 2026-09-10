/**
 * Nightly ad roll-ups. Aggregates raw `AdEvent` rows into per-campaign
 * `AdDailyStat`, charges FLAT_DAILY tiers their day rate, then compacts old
 * raw events past the retention window.
 */
import { prisma } from "@stall/db";
import { env } from "@stall/config";
import { platformEscrow, platformRevenue, postTxn } from "../wallet/ledger.ts";

function dayKey(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function rollupAdStats(forDay?: Date) {
  const day = dayKey(forDay ?? new Date(Date.now() - 86_400_000));
  const next = new Date(day.getTime() + 86_400_000);

  const grouped = await prisma.adEvent.groupBy({
    by: ["campaignId", "kind"],
    where: { at: { gte: day, lt: next } },
    _count: { _all: true },
    _sum: { costMinor: true },
  });

  const perCampaign = new Map<string, { impressions: number; clicks: number; conversions: number; spendMinor: number }>();
  for (const g of grouped) {
    const row = perCampaign.get(g.campaignId) ?? { impressions: 0, clicks: 0, conversions: 0, spendMinor: 0 };
    if (g.kind === "IMPRESSION") row.impressions += g._count._all;
    if (g.kind === "CLICK") row.clicks += g._count._all;
    if (g.kind === "CONVERSION") row.conversions += g._count._all;
    row.spendMinor += g._sum.costMinor ?? 0;
    perCampaign.set(g.campaignId, row);
  }

  let written = 0;
  for (const [campaignId, row] of perCampaign) {
    // conversion revenue attribution (best-effort): sum linked order totals
    const conv = await prisma.adEvent.findMany({ where: { campaignId, kind: "CONVERSION", at: { gte: day, lt: next } }, select: { meta: true } });
    const revenueMinor = conv.reduce((s, e) => s + Number((e.meta as { orderTotalMinor?: number } | null)?.orderTotalMinor ?? 0), 0);
    await prisma.adDailyStat.upsert({
      where: { campaignId_day: { campaignId, day } },
      create: { campaignId, day, ...row, revenueMinor },
      update: { ...row, revenueMinor },
    });
    written++;
  }

  // FLAT_DAILY billing — one day rate per active campaign per day it ran
  const flat = await prisma.campaign.findMany({
    where: { status: "ACTIVE", boostTier: { billingModel: "FLAT_DAILY" } },
    include: { boostTier: true },
  });
  for (const c of flat) {
    const already = await prisma.adEvent.findFirst({ where: { campaignId: c.id, kind: "CONVERSION", meta: { path: ["flatDayCharge"], equals: day.toISOString() } } });
    if (already) continue;
    const rate = Math.min(c.boostTier!.priceMinor, Math.max(0, c.budgetMinor - c.spentMinor));
    if (rate <= 0) continue;
    await prisma.$transaction(async (tx) => {
      await tx.adEvent.create({ data: { campaignId: c.id, kind: "CONVERSION", platformSlug: c.platformSlug, costMinor: rate, meta: { flatDayCharge: day.toISOString() } } });
      const updated = await tx.campaign.update({ where: { id: c.id }, data: { spentMinor: { increment: rate } } });
      if (updated.spentMinor >= updated.budgetMinor) await tx.campaign.update({ where: { id: c.id }, data: { status: "PAUSED" } });
    });
  }

  return { day: day.toISOString().slice(0, 10), campaigns: written, flatCharged: flat.length };
}

export async function compactAdEvents() {
  const cutoff = new Date(Date.now() - env.ANALYTICS_ROLLUP_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.adEvent.deleteMany({ where: { at: { lt: cutoff } } });
  return { pruned: count };
}

/** Record a conversion when a promoted product is purchased (called from orders). */
export async function attributeConversion(input: {
  productIds: string[];
  platformSlug: string;
  userId?: string;
  orderTotalMinor: number;
}) {
  if (input.productIds.length === 0) return { attributed: 0 };
  const items = await prisma.campaignItem.findMany({
    where: { productId: { in: input.productIds }, campaign: { platformSlug: input.platformSlug, status: { in: ["ACTIVE", "PAUSED", "COMPLETED"] } } },
    select: { campaignId: true },
    distinct: ["campaignId"],
  });
  for (const it of items) {
    await prisma.adEvent.create({
      data: { campaignId: it.campaignId, kind: "CONVERSION", userId: input.userId, platformSlug: input.platformSlug, meta: { orderTotalMinor: input.orderTotalMinor } },
    }).catch(() => {});
  }
  return { attributed: items.length };
}
