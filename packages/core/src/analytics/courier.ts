/** Courier analytics — completion history, acceptance, on-time, earnings trend. */
import { prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { resolveRange, dailySeries } from "./range.ts";

async function courierId(userId: string): Promise<string> {
  const c = await prisma.courierProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!c) throw new AppError("FORBIDDEN", "Not a courier");
  return c.id;
}

export async function courierAnalytics(userId: string, opts: { days?: number } = {}) {
  const id = await courierId(userId);
  const range = resolveRange(opts.days);

  const [deliveries, offers, earnings, profile] = await Promise.all([
    prisma.delivery.findMany({
      where: { courierId: id, createdAt: { gte: range.from } },
      select: { id: true, status: true, distanceM: true, createdAt: true, assignedAt: true, deliveredAt: true, etaAt: true },
    }),
    prisma.deliveryOffer.findMany({ where: { courierId: id, sentAt: { gte: range.from } }, select: { response: true } }),
    prisma.courierEarning.findMany({ where: { courierId: id, at: { gte: range.from } }, select: { netMinor: true, at: true } }),
    prisma.courierProfile.findUnique({ where: { id }, select: { ratingAvg: true, ratingCount: true, completedDeliveries: true } }),
  ]);

  const completed = deliveries.filter((d) => d.status === "COMPLETED");
  const cancelled = deliveries.filter((d) => d.status.startsWith("CANCELLED"));
  const offered = offers.length;
  const accepted = offers.filter((o) => o.response === "ACCEPTED").length;
  const onTime = completed.filter((d) => d.deliveredAt && d.etaAt && d.deliveredAt <= new Date(d.etaAt.getTime() + 5 * 60_000)).length;
  const distanceKm = Math.round(completed.reduce((s, d) => s + d.distanceM, 0) / 100) / 10;
  const netMinor = earnings.reduce((s, e) => s + e.netMinor, 0);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), days: range.days },
    deliveries: {
      completed: completed.length,
      cancelled: cancelled.length,
      lifetimeCompleted: profile?.completedDeliveries ?? completed.length,
      distanceKm,
      series: dailySeries(range, completed.map((d) => ({ at: d.deliveredAt ?? d.createdAt, value: 1 }))),
    },
    acceptance: { offered, accepted, rate: offered ? Math.round((accepted / offered) * 100) : 0 },
    onTime: { onTime, of: completed.length, rate: completed.length ? Math.round((onTime / completed.length) * 100) : 0 },
    earnings: {
      netMinor,
      perDeliveryMinor: completed.length ? Math.round(netMinor / completed.length) : 0,
      series: dailySeries(range, earnings.map((e) => ({ at: e.at, value: e.netMinor }))),
    },
    ratings: { avg: profile?.ratingAvg ?? 0, count: profile?.ratingCount ?? 0 },
  };
}
