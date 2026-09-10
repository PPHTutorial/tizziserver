/** Platform-wide analytics for the admin console dashboard + trend charts. */
import { prisma } from "@stall/db";
import { resolveRange, dailySeries } from "./range.ts";

export async function platformAnalytics(platformSlug: string, opts: { days?: number } = {}) {
  const range = resolveRange(opts.days);
  const since = { gte: range.from };

  const [orders, newUsers, activeVendors, deliveries, disputes, campaigns, draws] = await Promise.all([
    prisma.order.findMany({
      where: { platformSlug, createdAt: since, status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] } },
      select: { totalMinor: true, createdAt: true, customerId: true },
    }),
    prisma.user.count({ where: { createdAt: since } }),
    prisma.vendorOrder.findMany({ where: { order: { platformSlug }, createdAt: since }, select: { vendorId: true }, distinct: ["vendorId"] }),
    prisma.delivery.groupBy({ by: ["status"], where: { platformSlug, createdAt: since }, _count: { _all: true } }),
    prisma.dispute.groupBy({ by: ["status"], where: { createdAt: since }, _count: { _all: true } }),
    prisma.campaign.findMany({ where: { platformSlug, createdAt: since }, select: { spentMinor: true, status: true } }),
    prisma.draw.count({ where: { committedAt: since } }).catch(() => 0),
  ]);

  const gmvMinor = orders.reduce((s, o) => s + o.totalMinor, 0);
  const orderCount = orders.length;
  const buyers = new Set(orders.map((o) => o.customerId)).size;
  const deliveriesCompleted = deliveries.find((d) => d.status === "COMPLETED")?._count._all ?? 0;
  const deliveriesTotal = deliveries.reduce((s, d) => s + d._count._all, 0);
  const adSpendMinor = campaigns.reduce((s, c) => s + c.spentMinor, 0);
  const openDisputes = disputes.filter((d) => !["RESOLVED", "CLOSED"].includes(d.status)).reduce((s, d) => s + d._count._all, 0);

  const [kycQueue, reviewQueue, supportOpen] = await Promise.all([
    prisma.kycCase.count({ where: { status: { in: ["PENDING", "IN_REVIEW"] } } }).catch(() => 0),
    prisma.campaign.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
  ]);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days },
    kpis: {
      gmvMinor,
      orderCount,
      aovMinor: orderCount ? Math.round(gmvMinor / orderCount) : 0,
      newUsers,
      buyers,
      activeVendors: activeVendors.length,
      deliveriesCompleted,
      deliveryCompletionRate: deliveriesTotal ? Math.round((deliveriesCompleted / deliveriesTotal) * 100) : 0,
      adSpendMinor,
      draws,
    },
    queues: { kyc: kycQueue, campaignReview: reviewQueue, disputesOpen: openDisputes, supportOpen },
    gmvSeries: dailySeries(range, orders.map((o) => ({ at: o.createdAt, value: o.totalMinor }))),
  };
}
