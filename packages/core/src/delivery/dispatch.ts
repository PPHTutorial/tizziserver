/**
 * Dispatch engine — the ranked-offer waterfall.
 *
 * `dispatchDelivery` shortlists nearby online couriers (Redis GEO / PostGIS
 * fallback) and sends the next `DeliveryOffer` to the best candidate who hasn't
 * been tried, with a TTL. A courier `respondToOffer(ACCEPTED)` locks the
 * delivery; `DECLINED` (or a worker-swept `TIMEOUT`) advances the waterfall.
 * Every step writes a `DeliveryEvent` + an `OutboxEvent` (→ push + realtime).
 */
import { prisma, type Prisma } from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { shortlistCouriers } from "./presence.ts";
import { coarseAreaLabel } from "../maps/index.ts";
import { zoneForPoint } from "./zones.ts";

const OFFER_TTL_S = env.DISPATCH_OFFER_TTL_SECONDS;

export interface DispatchResult {
  status: "OFFERING" | "NO_COURIERS" | "ALREADY_ASSIGNED";
  offer?: { id: string; courierId: string; expiresAt: string; payoutMinor: number; rank: number };
  triedCount: number;
}

async function areaLabel(platformSlug: string, lat: number, lng: number): Promise<string> {
  const zone = await zoneForPoint(platformSlug, lat, lng).catch(() => null);
  return coarseAreaLabel({ lat, lng }, zone?.name ?? null);
}

/** Ensure the marketplace listing exists (area labels only — no PII). */
async function ensureJob(deliveryId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const d = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: { job: true } });
  if (d.job) return d.job;
  return tx.deliveryJob.create({
    data: {
      deliveryId,
      state: "OPEN",
      payoutMinor: d.courierPayoutMinor,
      currency: d.currency,
      pickupAreaLabel: await areaLabel(d.platformSlug, d.pickupLat, d.pickupLng),
      dropoffAreaLabel: await areaLabel(d.platformSlug, d.dropoffLat, d.dropoffLng),
      distanceM: d.distanceM,
      durationS: d.durationS,
      vehicleType: d.vehicleType,
    },
  });
}

/** Send the next offer in the waterfall. Idempotent-ish: a live PENDING offer short-circuits. */
export async function dispatchDelivery(deliveryId: string): Promise<DispatchResult> {
  const d = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { offers: true },
  });
  if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
  if (d.courierId || d.status === "COURIER_ASSIGNED") return { status: "ALREADY_ASSIGNED", triedCount: d.offers.length };

  // A still-live offer? leave it to run out.
  const now = Date.now();
  const live = d.offers.find((o) => o.response === "PENDING" && o.expiresAt.getTime() > now);
  if (live) {
    return {
      status: "OFFERING",
      triedCount: d.offers.length,
      offer: { id: live.id, courierId: live.courierId, expiresAt: live.expiresAt.toISOString(), payoutMinor: live.payoutMinor, rank: live.rank },
    };
  }

  const tried = new Set(d.offers.map((o) => o.courierId));
  const shortlist = await shortlistCouriers({
    platformSlug: d.platformSlug,
    point: { lat: d.pickupLat, lng: d.pickupLng },
    radiusM: env.DISPATCH_SHORTLIST_RADIUS_M * (1 + d.reassignCount * 0.5),
    limit: env.DISPATCH_SHORTLIST_SIZE,
    vehicleTypes: undefined,
    excludeCourierIds: [...tried],
  });
  const pick = shortlist[0];

  await ensureJob(deliveryId);

  if (!pick) {
    await prisma.$transaction([
      prisma.delivery.update({ where: { id: deliveryId }, data: { status: "SEARCHING_COURIER" } }),
      prisma.deliveryJob.update({ where: { deliveryId }, data: { state: "OPEN" } }),
      prisma.deliveryEvent.create({ data: { deliveryId, type: "DISPATCH_NO_COURIERS", actorType: "SYSTEM", data: { tried: d.offers.length } } }),
    ]);
    return { status: "NO_COURIERS", triedCount: d.offers.length };
  }

  const rank = d.offers.length + 1;
  const expiresAt = new Date(now + OFFER_TTL_S * 1000);
  const offer = await prisma.$transaction(async (tx) => {
    const o = await tx.deliveryOffer.create({
      data: {
        deliveryId,
        courierId: pick.courierId,
        rank,
        distanceM: pick.distanceM,
        payoutMinor: d.courierPayoutMinor,
        response: "PENDING",
        expiresAt,
      },
    });
    await tx.delivery.update({ where: { id: deliveryId }, data: { status: "SEARCHING_COURIER" } });
    await tx.deliveryJob.update({ where: { deliveryId }, data: { state: "OFFERING", offeredCount: { increment: 1 }, expiresAt } });
    await tx.deliveryEvent.create({
      data: { deliveryId, type: "DISPATCH_OFFER_SENT", actorType: "SYSTEM", data: { courierId: pick.courierId, rank, distanceM: pick.distanceM } },
    });
    await tx.outboxEvent.create({
      data: {
        type: "delivery.offer",
        aggregateType: "Delivery",
        aggregateId: deliveryId,
        payload: { offerId: o.id, courierId: pick.courierId, payoutMinor: d.courierPayoutMinor, expiresAt: expiresAt.toISOString() },
      },
    });
    return o;
  });

  return {
    status: "OFFERING",
    triedCount: rank,
    offer: { id: offer.id, courierId: offer.courierId, expiresAt: offer.expiresAt.toISOString(), payoutMinor: offer.payoutMinor, rank },
  };
}

export type OfferResponse = "ACCEPTED" | "DECLINED";

/** Courier acts on a pending offer. ACCEPTED locks the delivery; DECLINED advances. */
export async function respondToOffer(
  courierId: string,
  offerId: string,
  response: OfferResponse,
  declineReason?: string,
): Promise<{ deliveryId: string; status: string }> {
  const offer = await prisma.deliveryOffer.findUnique({ where: { id: offerId }, include: { delivery: true } });
  if (!offer || offer.courierId !== courierId) throw new AppError("NOT_FOUND", "Offer not found");
  if (offer.response !== "PENDING") throw new AppError("CONFLICT", `Offer already ${offer.response.toLowerCase()}`);
  if (offer.expiresAt.getTime() < Date.now()) {
    await prisma.deliveryOffer.update({ where: { id: offerId }, data: { response: "TIMEOUT", respondedAt: new Date() } });
    throw new AppError("CONFLICT", "This offer has expired");
  }
  const d = offer.delivery;

  if (response === "DECLINED") {
    await prisma.$transaction([
      prisma.deliveryOffer.update({ where: { id: offerId }, data: { response: "DECLINED", declineReason, respondedAt: new Date() } }),
      prisma.deliveryEvent.create({ data: { deliveryId: d.id, type: "DISPATCH_OFFER_DECLINED", actorType: "USER", actorId: courierId, data: { reason: declineReason } } }),
    ]);
    await dispatchDelivery(d.id).catch(() => {});
    return { deliveryId: d.id, status: "SEARCHING_COURIER" };
  }

  if (d.courierId) throw new AppError("CONFLICT", "This delivery was already taken");

  await prisma.$transaction(async (tx) => {
    await tx.deliveryOffer.update({ where: { id: offerId }, data: { response: "ACCEPTED", respondedAt: new Date() } });
    await tx.deliveryOffer.updateMany({
      where: { deliveryId: d.id, response: "PENDING", NOT: { id: offerId } },
      data: { response: "TIMEOUT", respondedAt: new Date() },
    });
    await tx.delivery.update({
      where: { id: d.id },
      data: { courierId, status: "COURIER_ASSIGNED", assignedAt: new Date() },
    });
    await tx.deliveryJob.update({ where: { deliveryId: d.id }, data: { state: "ASSIGNED", expiresAt: null } });
    await tx.courierProfile.update({ where: { id: courierId }, data: { onlineStatus: "ON_JOB" } });
    await tx.deliveryEvent.create({ data: { deliveryId: d.id, type: "COURIER_ASSIGNED", actorType: "USER", actorId: courierId } });
    await tx.outboxEvent.create({
      data: { type: "delivery.assigned", aggregateType: "Delivery", aggregateId: d.id, payload: { courierId, code: d.code } },
    });
  });

  return { deliveryId: d.id, status: "COURIER_ASSIGNED" };
}

/**
 * Worker: deliveries stuck in SEARCHING/REASSIGNING with no live offer for too
 * long → CANCELLED_BY_SYSTEM. FULFILMENT deliveries drop back to a PENDING
 * fulfilment so the vendor/customer can retry.
 */
export async function expireUndispatchable(maxAgeMinutes = 15): Promise<{ cancelled: number }> {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60_000);
  const stuck = await prisma.delivery.findMany({
    where: {
      status: { in: ["SEARCHING_COURIER", "REASSIGNING", "REQUESTED"] },
      courierId: null,
      updatedAt: { lt: cutoff },
      offers: { none: { response: "PENDING", expiresAt: { gt: new Date() } } },
    },
    select: { id: true, code: true, sourceType: true, sourceId: true },
    take: 50,
  });
  for (const d of stuck) {
    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({ where: { id: d.id }, data: { status: "CANCELLED_BY_SYSTEM", cancelledAt: new Date(), cancelReason: "no_courier_available" } });
      await tx.deliveryJob.updateMany({ where: { deliveryId: d.id }, data: { state: "CANCELLED" } });
      await tx.deliveryEvent.create({ data: { deliveryId: d.id, type: "CANCELLED_BY_SYSTEM", actorType: "SYSTEM", data: { reason: "no_courier_available" } } });
      await tx.outboxEvent.create({ data: { type: "delivery.cancelled", aggregateType: "Delivery", aggregateId: d.id, payload: { code: d.code, reason: "no_courier_available" } } });
      if (d.sourceType === "FULFILMENT") {
        await tx.fulfilment.updateMany({ where: { id: d.sourceId }, data: { status: "PENDING", deliveryId: null } });
      }
    });
  }
  return { cancelled: stuck.length };
}

/** Worker sweep: expire stale PENDING offers → TIMEOUT and advance the waterfall. */
export async function sweepExpiredOffers(): Promise<{ swept: number; redispatched: number }> {
  const stale = await prisma.deliveryOffer.findMany({
    where: { response: "PENDING", expiresAt: { lt: new Date() } },
    select: { id: true, deliveryId: true },
    take: 100,
  });
  if (stale.length === 0) return { swept: 0, redispatched: 0 };
  await prisma.deliveryOffer.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { response: "TIMEOUT", respondedAt: new Date() },
  });
  const deliveryIds = [...new Set(stale.map((s) => s.deliveryId))];
  let redispatched = 0;
  for (const id of deliveryIds) {
    const d = await prisma.delivery.findUnique({ where: { id }, select: { courierId: true, status: true } });
    if (d && !d.courierId && d.status === "SEARCHING_COURIER") {
      await dispatchDelivery(id).catch(() => {});
      redispatched += 1;
    }
  }
  return { swept: stale.length, redispatched };
}
