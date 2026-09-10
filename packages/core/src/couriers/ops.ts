/**
 * Courier working state — online/offline, shifts, the dashboard, performance
 * metrics, and the available-jobs feed (offers + nearby OPEN jobs, PII-masked).
 */
import { prisma, type Prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { upsertCourierPresence, removeCourierPresence } from "../delivery/presence.ts";
import { courierEarningsSummary } from "../delivery/earnings.ts";
import { haversineM } from "../maps/index.ts";

/** Resolve a user's CourierProfile id (throws if they aren't a courier). */
export async function courierIdForUser(userId: string): Promise<string> {
  const c = await prisma.courierProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!c) throw new AppError("FORBIDDEN", "Not a courier");
  return c.id;
}

async function activeCourier(userId: string) {
  const c = await prisma.courierProfile.findUnique({ where: { userId }, include: { vehicles: true } });
  if (!c) throw new AppError("FORBIDDEN", "Complete courier onboarding first");
  if (c.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Your courier account isn't approved yet");
  return c;
}

function activeVehicleType(c: { activeVehicleId: string | null; vehicles: { id: string; type: string }[] }) {
  return (c.vehicles.find((v) => v.id === c.activeVehicleId)?.type ?? c.vehicles[0]?.type ?? "MOTORBIKE") as never;
}

export async function goOnline(userId: string, platformSlug: string, at: { lat: number; lng: number }) {
  const c = await activeCourier(userId);
  const openShift = await prisma.courierShift.findFirst({ where: { courierId: c.id, endedAt: null } });
  await prisma.$transaction([
    prisma.courierProfile.update({ where: { id: c.id }, data: { onlineStatus: "ONLINE" } }),
    ...(openShift ? [] : [prisma.courierShift.create({ data: { courierId: c.id } })]),
  ]);
  await upsertCourierPresence({ courierId: c.id, platformSlug, lat: at.lat, lng: at.lng, vehicleType: activeVehicleType(c) });
  return { onlineStatus: "ONLINE" as const };
}

export async function goOffline(userId: string, platformSlug: string) {
  const c = await prisma.courierProfile.findUnique({ where: { userId } });
  if (!c) throw new AppError("FORBIDDEN", "Not a courier");
  const openShift = await prisma.courierShift.findFirst({ where: { courierId: c.id, endedAt: null } });
  await prisma.$transaction([
    prisma.courierProfile.update({ where: { id: c.id }, data: { onlineStatus: "OFFLINE" } }),
    ...(openShift
      ? [
          prisma.courierShift.update({
            where: { id: openShift.id },
            data: { endedAt: new Date(), onlineSeconds: Math.round((Date.now() - openShift.startedAt.getTime()) / 1000) },
          }),
        ]
      : []),
  ]);
  await removeCourierPresence(c.id, platformSlug);
  return { onlineStatus: "OFFLINE" as const };
}

/** Position heartbeat while online (also sent over the /tracking socket). */
export async function heartbeat(userId: string, platformSlug: string, at: { lat: number; lng: number; heading?: number; speed?: number }) {
  const c = await activeCourier(userId);
  if (c.onlineStatus === "OFFLINE") return { accepted: false as const };
  await upsertCourierPresence({
    courierId: c.id,
    platformSlug,
    lat: at.lat,
    lng: at.lng,
    vehicleType: activeVehicleType(c),
    onJob: c.onlineStatus === "ON_JOB",
  });
  return { accepted: true as const };
}

export async function courierDashboard(userId: string) {
  const c = await prisma.courierProfile.findUnique({ where: { userId }, include: { vehicles: true } });
  if (!c) return { onboarded: false as const };

  const [active, earnings, todayOffers] = await Promise.all([
    prisma.delivery.findFirst({
      where: { courierId: c.id, status: { notIn: ["COMPLETED", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_COURIER", "CANCELLED_BY_SYSTEM"] } },
      orderBy: { assignedAt: "desc" },
      select: { id: true, code: true, status: true, dropoffAddress: true, etaAt: true, feeMinor: true, courierPayoutMinor: true },
    }),
    courierEarningsSummary(c.id),
    prisma.deliveryOffer.count({ where: { courierId: c.id, sentAt: { gte: new Date(Date.now() - 86_400_000) } } }),
  ]);

  return {
    onboarded: true as const,
    status: c.status,
    onlineStatus: c.onlineStatus,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    completedDeliveries: c.completedDeliveries,
    acceptanceRate: c.acceptanceRate,
    cancellationRate: c.cancellationRate,
    earnings: { balanceMinor: earnings.balanceMinor, today: earnings.today, week: earnings.week, currency: earnings.currency },
    todayOffers,
    activeDelivery: active
      ? { id: active.id, code: active.code, status: active.status, etaAt: active.etaAt?.toISOString() ?? null, payoutMinor: active.courierPayoutMinor }
      : null,
  };
}

export async function courierPerformance(userId: string) {
  const c = await prisma.courierProfile.findUnique({ where: { userId } });
  if (!c) return { onboarded: false as const };

  const offers = await prisma.deliveryOffer.findMany({ where: { courierId: c.id }, select: { response: true } });
  const accepted = offers.filter((o) => o.response === "ACCEPTED").length;
  const declined = offers.filter((o) => o.response === "DECLINED").length;
  const timeouts = offers.filter((o) => o.response === "TIMEOUT").length;

  const completed = await prisma.delivery.findMany({
    where: { courierId: c.id, status: "COMPLETED" },
    select: { assignedAt: true, completedAt: true, distanceM: true },
  });
  const durations = completed
    .filter((d) => d.assignedAt && d.completedAt)
    .map((d) => (d.completedAt!.getTime() - d.assignedAt!.getTime()) / 60000);
  const avgMinutes = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  const ratings = await prisma.deliveryRating.groupBy({
    by: ["stars"],
    where: { delivery: { courierId: c.id }, role: "CUSTOMER" },
    _count: true,
  });
  const ratingBreakdown = [1, 2, 3, 4, 5].map((s) => ({ stars: s, count: ratings.find((r) => r.stars === s)?._count ?? 0 }));

  return {
    onboarded: true as const,
    ratingAvg: c.ratingAvg,
    ratingCount: c.ratingCount,
    completedDeliveries: c.completedDeliveries,
    acceptanceRate: offers.length ? Math.round((accepted / offers.length) * 100) : 0,
    declineCount: declined,
    timeoutCount: timeouts,
    avgDeliveryMinutes: avgMinutes,
    totalDistanceKm: Math.round(completed.reduce((n, d) => n + d.distanceM, 0) / 1000),
    ratingBreakdown,
    level: (c.level as Prisma.JsonValue) ?? { tier: "BRONZE", points: c.completedDeliveries * 10 },
  };
}

/** Roll acceptance / cancellation projections onto the profile (worker or inline). */
export async function recomputeCourierRates(courierId: string) {
  const offers = await prisma.deliveryOffer.findMany({ where: { courierId }, select: { response: true } });
  const responded = offers.filter((o) => o.response !== "PENDING");
  const accepted = offers.filter((o) => o.response === "ACCEPTED").length;
  const cancelledByThem = await prisma.deliveryEvent.count({
    where: { type: "CANCELLED_BY_COURIER", actorId: (await prisma.courierProfile.findUnique({ where: { id: courierId }, select: { userId: true } }))?.userId },
  });
  const total = accepted + cancelledByThem || 1;
  await prisma.courierProfile.update({
    where: { id: courierId },
    data: {
      acceptanceRate: responded.length ? accepted / responded.length : 0,
      cancellationRate: cancelledByThem / total,
    },
  });
}

// --- available jobs ---------------------------------------------------

export async function listAvailableJobs(userId: string, near?: { lat: number; lng: number }) {
  const c = await activeCourier(userId);

  const offers = await prisma.deliveryOffer.findMany({
    where: { courierId: c.id, response: "PENDING", expiresAt: { gt: new Date() } },
    include: { delivery: { include: { job: true, items: true } } },
    orderBy: { sentAt: "desc" },
  });

  const shaped = offers
    .filter((o) => o.delivery.job)
    .map((o) => {
      const j = o.delivery.job!;
      return {
        offerId: o.id,
        deliveryId: o.deliveryId,
        state: "OFFERED" as const,
        payoutMinor: o.payoutMinor,
        currency: j.currency,
        pickupArea: j.pickupAreaLabel,
        dropoffArea: j.dropoffAreaLabel,
        distanceM: j.distanceM,
        durationS: j.durationS,
        vehicleType: j.vehicleType,
        itemCount: o.delivery.items.reduce((n, it) => n + it.qty, 0),
        requirements: j.requirements,
        expiresAt: o.expiresAt.toISOString(),
        pickupDistanceM: near ? haversineM(near, { lat: o.delivery.pickupLat, lng: o.delivery.pickupLng }) : o.distanceM,
      };
    });

  return { items: shaped };
}

export async function getJobDetail(userId: string, offerId: string) {
  const c = await activeCourier(userId);
  const offer = await prisma.deliveryOffer.findFirst({
    where: { id: offerId, courierId: c.id },
    include: { delivery: { include: { job: true, items: true } } },
  });
  if (!offer || !offer.delivery.job) throw new AppError("NOT_FOUND", "Job not found");
  const j = offer.delivery.job;
  const d = offer.delivery;
  const expired = offer.expiresAt.getTime() < Date.now() || offer.response !== "PENDING";
  return {
    offerId: offer.id,
    deliveryId: d.id,
    expired,
    response: offer.response,
    payoutMinor: offer.payoutMinor,
    currency: j.currency,
    // pre-acceptance: area labels + approximate points only, no contact PII
    pickup: { area: j.pickupAreaLabel, approxLat: Number(d.pickupLat.toFixed(2)), approxLng: Number(d.pickupLng.toFixed(2)) },
    dropoff: { area: j.dropoffAreaLabel, approxLat: Number(d.dropoffLat.toFixed(2)), approxLng: Number(d.dropoffLng.toFixed(2)) },
    distanceM: j.distanceM,
    durationS: j.durationS,
    vehicleType: j.vehicleType,
    requirements: j.requirements,
    items: d.items.map((it) => ({ description: it.description, qty: it.qty, fragile: it.fragile })),
    expiresAt: offer.expiresAt.toISOString(),
  };
}
