/** Vendor analytics — sales, products, customers, payouts, ratings, ad ROI. */
import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { balanceOf, vendorPayable } from "../wallet/ledger.ts";
import { resolveRange, dailySeries } from "./range.ts";

export async function vendorProfileIdForUser(userId: string): Promise<string> {
  const v = await prisma.vendorProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!v) throw new AppError("FORBIDDEN", "Not a vendor");
  return v.id;
}

export async function vendorAnalytics(userId: string, opts: { days?: number } = {}) {
  const vendorId = await vendorProfileIdForUser(userId);
  const range = resolveRange(opts.days);

  const vendorOrders = await prisma.vendorOrder.findMany({
    where: { vendorId, createdAt: { gte: range.from } },
    include: { items: true, order: { select: { customerId: true, platformSlug: true } } },
  });

  const paid = vendorOrders.filter((vo) => vo.status !== "CANCELLED");
  const grossMinor = paid.reduce((s, vo) => s + vo.subtotalMinor - vo.discountMinor, 0);
  const commissionMinor = paid.reduce((s, vo) => s + vo.commissionMinor, 0);
  const netMinor = paid.reduce((s, vo) => s + vo.payoutMinor, 0);
  const units = paid.reduce((s, vo) => s + vo.items.reduce((n, it) => n + it.qty, 0), 0);
  const orderCount = paid.length;

  // top products by revenue
  const byProduct = new Map<string, { title: string; units: number; revenueMinor: number }>();
  for (const vo of paid) {
    for (const it of vo.items) {
      const row = byProduct.get(it.productId) ?? { title: it.titleSnapshot, units: 0, revenueMinor: 0 };
      row.units += it.qty;
      row.revenueMinor += it.totalMinor;
      byProduct.set(it.productId, row);
    }
  }
  const topProducts = [...byProduct.entries()]
    .map(([productId, r]) => ({ productId, ...r }))
    .sort((a, b) => b.revenueMinor - a.revenueMinor)
    .slice(0, 10);

  // customers: new vs returning within the window
  const custFirstSeen = new Map<string, number>();
  for (const vo of paid) {
    const c = vo.order.customerId;
    custFirstSeen.set(c, (custFirstSeen.get(c) ?? 0) + 1);
  }
  const priorCustomers = new Set(
    (
      await prisma.vendorOrder.findMany({
        where: { vendorId, createdAt: { lt: range.from }, status: { not: "CANCELLED" } },
        select: { order: { select: { customerId: true } } },
      })
    ).map((vo) => vo.order.customerId),
  );
  const uniqueCustomers = custFirstSeen.size;
  const returningCustomers = [...custFirstSeen.keys()].filter((c) => priorCustomers.has(c)).length;

  // payouts
  const payouts = await prisma.payout.findMany({
    where: { ownerType: "VENDOR", ownerId: vendorId, createdAt: { gte: range.from } },
    orderBy: { createdAt: "desc" },
  });
  const paidOutMinor = payouts.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amountMinor, 0);
  const pendingPayoutMinor = payouts.filter((p) => p.status !== "PAID").reduce((s, p) => s + p.amountMinor, 0);
  const balanceMinor = await balanceOf(vendorPayable(vendorId));

  const profile = await prisma.vendorProfile.findUnique({ where: { id: vendorId }, select: { ratingAvg: true, ratingCount: true } });

  // ad ROI
  const campaigns = await prisma.campaign.findMany({
    where: { vendorId: userId, createdAt: { gte: range.from } },
    include: { dailyStats: true },
  });
  const adSpendMinor = campaigns.reduce((s, c) => s + c.spentMinor, 0);
  const adRevenueMinor = campaigns.reduce((s, c) => s + c.dailyStats.reduce((n, d) => n + d.revenueMinor, 0), 0);
  const adImpressions = campaigns.reduce((s, c) => s + c.dailyStats.reduce((n, d) => n + d.impressions, 0), 0);
  const adClicks = campaigns.reduce((s, c) => s + c.dailyStats.reduce((n, d) => n + d.clicks, 0), 0);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days },
    sales: {
      grossMinor,
      netMinor,
      commissionMinor,
      orderCount,
      units,
      aovMinor: orderCount ? Math.round(grossMinor / orderCount) : 0,
      series: dailySeries(range, paid.map((vo) => ({ at: vo.createdAt, value: vo.subtotalMinor - vo.discountMinor }))),
    },
    topProducts,
    customers: { unique: uniqueCustomers, returning: returningCustomers, new: uniqueCustomers - returningCustomers },
    payouts: {
      balanceMinor,
      paidOutMinor,
      pendingPayoutMinor,
      recent: payouts.slice(0, 8).map((p) => ({ id: p.id, amountMinor: p.amountMinor, status: p.status, at: p.createdAt.toISOString() })),
    },
    ratings: { avg: profile?.ratingAvg ?? 0, count: profile?.ratingCount ?? 0 },
    advertising: {
      spendMinor: adSpendMinor,
      revenueMinor: adRevenueMinor,
      roas: adSpendMinor ? Math.round((adRevenueMinor / adSpendMinor) * 100) / 100 : 0,
      impressions: adImpressions,
      clicks: adClicks,
      ctr: adImpressions ? Math.round((adClicks / adImpressions) * 10000) / 100 : 0,
    },
  };
}
