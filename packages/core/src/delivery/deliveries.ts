/**
 * Delivery aggregate — creation, reads, the active-delivery state machine,
 * pickup/dropoff verification, proof-of-delivery, ratings, disputes, and the
 * breadcrumb track that feeds the customer's live map.
 *
 * Money: a delivery's `feeMinor` is captured into platform ESCROW up front
 * (ADHOC: wallet/gateway at creation; FULFILMENT: as part of the order total in
 * Phase 3). On COMPLETED the escrow releases `courierPayoutMinor` to the courier
 * PAYABLE and the remainder to platform REVENUE. `completeVendorOrder` no longer
 * releases the delivery fee when a delivery is attached (see orders.ts).
 */
import {
  prisma,
  type Prisma,
  type Delivery,
  type DeliveryStatus,
  type DeliverySourceType,
  type VehicleKind,
  type PickupVerifyMethod,
  type DeliveryVerifyMethod,
} from "@stall/db";
import { env } from "@stall/config";
import { AppError } from "../errors.ts";
import { numericCode, randomToken } from "../crypto.ts";
import { courierPayable, platformEscrow, platformRevenue, postTxn } from "../wallet/ledger.ts";
import { payFromWallet } from "../wallet/wallet.ts";
import { DEFAULT_LATLNG, estimateRoute, etaFrom, haversineM, type LatLng } from "../maps/index.ts";
import { quoteDeliveryFee } from "./pricing.ts";
import { isServiceable } from "./zones.ts";
import { dispatchDelivery } from "./dispatch.ts";
import { postCourierEarning } from "./earnings.ts";
import { upsertCourierPresence } from "./presence.ts";
import { completeVendorOrderSystem } from "../commerce/orders.ts";

const CUR = "GHS";
const BREADCRUMB_MIN_GAP_MS = 8_000;

function deliveryCode(): string {
  const d = new Date();
  const ymd = `${d.getFullYear().toString().slice(2)}${`${d.getMonth() + 1}`.padStart(2, "0")}${`${d.getDate()}`.padStart(2, "0")}`;
  return `DLV-${ymd}-${randomToken(4).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5).padEnd(5, "0")}`;
}

// ------------------------------------------------------------- shaping

const ACTIVE_STATES: DeliveryStatus[] = [
  "REQUESTED",
  "SEARCHING_COURIER",
  "COURIER_ASSIGNED",
  "COURIER_EN_ROUTE_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "EN_ROUTE_DROPOFF",
  "ARRIVED_DROPOFF",
  "DELIVERED",
  "REASSIGNING",
  "RESCHEDULED",
];

export const isActive = (s: DeliveryStatus) => ACTIVE_STATES.includes(s);

type FullDelivery = Prisma.DeliveryGetPayload<{
  include: {
    items: true;
    events: true;
    pickupVerification: true;
    dropoffVerification: true;
    proofOfDelivery: true;
    ratings: true;
    courier: { include: { user: true; vehicles: true } };
  };
}>;

const fullInclude = {
  items: true,
  events: { orderBy: { at: "asc" } },
  pickupVerification: true,
  dropoffVerification: true,
  proofOfDelivery: true,
  ratings: true,
  courier: { include: { user: true, vehicles: true } },
} satisfies Prisma.DeliveryInclude;

interface ShapeOpts {
  viewer: "customer" | "courier" | "vendor" | "ops";
}

function shapeDelivery(d: FullDelivery, opts: ShapeOpts) {
  const courierVehicle = d.courier?.vehicles.find((v) => v.id === d.courier?.activeVehicleId) ?? d.courier?.vehicles[0];
  // The courier must obtain each code from the counterparty in person — that's
  // the verification. Only the counterparty (+ ops) ever sees a code.
  const showPickupCode = opts.viewer === "vendor" || opts.viewer === "ops";
  const showDropoffCode = opts.viewer === "customer" || opts.viewer === "ops";
  return {
    id: d.id,
    code: d.code,
    platformSlug: d.platformSlug,
    sourceType: d.sourceType,
    sourceId: d.sourceId,
    status: d.status,
    active: isActive(d.status),
    vehicleType: d.vehicleType,
    distanceM: d.distanceM,
    durationS: d.durationS,
    feeMinor: d.feeMinor,
    courierPayoutMinor: opts.viewer === "customer" ? undefined : d.courierPayoutMinor,
    tipMinor: d.tipMinor,
    currency: d.currency,
    pickup: {
      lat: d.pickupLat,
      lng: d.pickupLng,
      address: d.pickupAddress,
      contact: opts.viewer === "customer" ? undefined : d.pickupContact,
    },
    dropoff: {
      lat: d.dropoffLat,
      lng: d.dropoffLng,
      address: d.dropoffAddress,
      contact: opts.viewer === "vendor" ? undefined : d.dropoffContact,
    },
    items: d.items.map((it) => ({
      id: it.id,
      description: it.description,
      qty: it.qty,
      photoKey: it.photoKey,
      valueMinor: it.valueMinor,
      fragile: it.fragile,
    })),
    courier: d.courier
      ? {
          id: d.courier.id,
          name: [d.courier.user.firstName, d.courier.user.lastName].filter(Boolean).join(" ") || "Courier",
          phone: opts.viewer === "ops" ? d.courier.user.phone : undefined,
          avatar: d.courier.user.avatar,
          ratingAvg: d.courier.ratingAvg,
          ratingCount: d.courier.ratingCount,
          completedDeliveries: d.courier.completedDeliveries,
          vehicle: courierVehicle
            ? { type: courierVehicle.type, make: courierVehicle.make, model: courierVehicle.model, color: courierVehicle.color, plate: courierVehicle.plate }
            : null,
        }
      : null,
    pickupVerification: d.pickupVerification
      ? {
          method: d.pickupVerification.method,
          verified: !!d.pickupVerification.verifiedAt,
          packageCount: d.pickupVerification.packageCount,
          photoKeys: d.pickupVerification.photoKeys,
        }
      : null,
    dropoffVerification: d.dropoffVerification
      ? { method: d.dropoffVerification.method, verified: !!d.dropoffVerification.verifiedAt, recipientName: d.dropoffVerification.recipientName }
      : null,
    proofOfDelivery: d.proofOfDelivery
      ? { photoKeys: d.proofOfDelivery.photoKeys, notes: d.proofOfDelivery.notes, at: d.proofOfDelivery.at.toISOString() }
      : null,
    pickupCode: showPickupCode ? d.pickupCode ?? undefined : undefined,
    dropoffCode: showDropoffCode ? d.dropoffCode ?? undefined : undefined,
    ratings: d.ratings.map((r) => ({ role: r.role, stars: r.stars, tags: r.tags, comment: r.comment })),
    scheduledFor: d.scheduledFor?.toISOString() ?? null,
    assignedAt: d.assignedAt?.toISOString() ?? null,
    pickedUpAt: d.pickedUpAt?.toISOString() ?? null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    completedAt: d.completedAt?.toISOString() ?? null,
    etaAt: d.etaAt?.toISOString() ?? null,
    cancelReason: d.cancelReason,
    reassignCount: d.reassignCount,
    createdAt: d.createdAt.toISOString(),
    events: d.events.map((e) => ({ type: e.type, actorType: e.actorType, at: e.at.toISOString(), data: e.data, lat: e.lat, lng: e.lng })),
  };
}

export type DeliveryView = ReturnType<typeof shapeDelivery>;

async function loadFull(id: string): Promise<FullDelivery> {
  const d = await prisma.delivery.findUnique({ where: { id }, include: fullInclude });
  if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
  return d;
}

// ------------------------------------------------------------- creation

export interface Endpoint {
  lat: number;
  lng: number;
  address: Record<string, unknown>;
  contact?: { name?: string; phone?: string };
}

export interface CreateDeliveryInput {
  platformSlug: string;
  sourceType: DeliverySourceType;
  sourceId: string;
  customerId?: string;
  pickup: Endpoint;
  dropoff: Endpoint;
  items?: { description: string; qty?: number; photoKey?: string; valueMinor?: number; fragile?: boolean }[];
  vehicleType?: VehicleKind;
  scheduledFor?: Date;
  /** ADHOC only: how the fee is funded. FULFILMENT deliveries are pre-funded via the order. */
  payment?: { method: "wallet"; userId: string };
  autoDispatch?: boolean;
}

export interface CreatedDelivery {
  delivery: DeliveryView;
  pickupOtp: string;
  dropoffOtp: string;
}

export async function createDelivery(input: CreateDeliveryInput): Promise<CreatedDelivery> {
  const pickup = input.pickup;
  const dropoff = input.dropoff;
  if (!(await isServiceable(input.platformSlug, dropoff.lat, dropoff.lng))) {
    throw new AppError("CONFLICT", "We don't deliver to that area yet");
  }

  const route = await estimateRoute({ lat: pickup.lat, lng: pickup.lng }, { lat: dropoff.lat, lng: dropoff.lng });
  const quote = await quoteDeliveryFee({
    platformSlug: input.platformSlug,
    distanceM: route.distanceM,
    durationS: route.durationS,
    vehicleType: input.vehicleType,
  });

  const pickupOtp = numericCode(4);
  const dropoffOtp = numericCode(4);
  const code = deliveryCode();
  const scheduled = input.scheduledFor && input.scheduledFor.getTime() > Date.now() ? input.scheduledFor : null;

  // ADHOC: capture the fee into escrow now.
  if (input.sourceType === "ADHOC" && input.payment) {
    await payFromWallet({
      userId: input.payment.userId,
      amountMinor: quote.feeMinor,
      platformSlug: input.platformSlug,
      currency: quote.currency,
      memo: `Delivery ${code}`,
      reference: { deliveryCode: code },
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const d = await tx.delivery.create({
      data: {
        code,
        platformSlug: input.platformSlug,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: "REQUESTED",
        customerId: input.customerId,
        vehicleType: input.vehicleType ?? "MOTORBIKE",
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: pickup.address as Prisma.InputJsonValue,
        pickupContact: (pickup.contact ?? undefined) as Prisma.InputJsonValue,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        dropoffAddress: dropoff.address as Prisma.InputJsonValue,
        dropoffContact: (dropoff.contact ?? undefined) as Prisma.InputJsonValue,
        distanceM: route.distanceM,
        durationS: route.durationS,
        feeMinor: quote.feeMinor,
        courierPayoutMinor: quote.courierPayoutMinor,
        currency: quote.currency,
        pickupCode: pickupOtp,
        dropoffCode: dropoffOtp,
        scheduledFor: scheduled,
        etaAt: etaFrom(route.durationS),
      },
    });
    if (input.items?.length) {
      await tx.deliveryItem.createMany({
        data: input.items.map((it) => ({
          deliveryId: d.id,
          description: it.description,
          qty: it.qty ?? 1,
          photoKey: it.photoKey,
          valueMinor: it.valueMinor,
          fragile: it.fragile ?? false,
        })),
      });
    }
    await tx.pickupVerification.create({ data: { deliveryId: d.id, method: "OTP" } });
    await tx.deliveryVerification.create({ data: { deliveryId: d.id, method: "OTP" } });
    await tx.deliveryEvent.create({ data: { deliveryId: d.id, type: "CREATED", actorType: "SYSTEM", data: { code, feeMinor: quote.feeMinor } } });
    await tx.outboxEvent.create({
      data: { type: "delivery.created", aggregateType: "Delivery", aggregateId: d.id, payload: { code, sourceType: input.sourceType, sourceId: input.sourceId } },
    });
    return d;
  });

  if (!scheduled && (input.autoDispatch ?? true)) {
    await dispatchDelivery(created.id).catch((e) => console.error("[dispatch] initial", e));
  }

  const full = await loadFull(created.id);
  return {
    delivery: shapeDelivery(full, { viewer: "ops" }),
    pickupOtp,
    dropoffOtp,
  };
}

/**
 * Spawn (or return) the delivery for a DELIVERY-method fulfilment. Called when a
 * vendor marks a sub-order READY_FOR_PICKUP. Pickup = vendor business location,
 * dropoff = the order's delivery address (its stored geo point, else Accra).
 */
export async function ensureDeliveryForVendorOrder(vendorOrderId: string): Promise<string | null> {
  const vo = await prisma.vendorOrder.findUnique({
    where: { id: vendorOrderId },
    include: {
      fulfilment: true,
      order: { include: { address: true, customer: { select: { id: true, firstName: true, lastName: true, phone: true } } } },
      vendor: { include: { business: true, user: { select: { firstName: true, lastName: true, phone: true } } } },
      items: true,
    },
  });
  if (!vo || !vo.fulfilment) return null;
  if (vo.fulfilment.method !== "DELIVERY") return null;
  if (vo.fulfilment.deliveryId) return vo.fulfilment.deliveryId;

  // vendor pickup point
  let pickupPt: LatLng = DEFAULT_LATLNG;
  if (vo.vendor.business) {
    const rows = await prisma.$queryRawUnsafe<{ lat: number | null; lng: number | null }[]>(
      `SELECT ST_Y("location"::geometry) AS lat, ST_X("location"::geometry) AS lng FROM "businesses" WHERE "id" = $1`,
      vo.vendor.business.id,
    );
    if (rows[0]?.lat != null && rows[0]?.lng != null) pickupPt = { lat: rows[0].lat, lng: rows[0].lng };
  }

  // customer dropoff point
  let dropPt: LatLng = { lat: DEFAULT_LATLNG.lat + 0.02, lng: DEFAULT_LATLNG.lng + 0.02 };
  if (vo.order.addressId) {
    const rows = await prisma.$queryRawUnsafe<{ lat: number | null; lng: number | null }[]>(
      `SELECT ST_Y("location"::geometry) AS lat, ST_X("location"::geometry) AS lng FROM "addresses" WHERE "id" = $1`,
      vo.order.addressId,
    );
    if (rows[0]?.lat != null && rows[0]?.lng != null) dropPt = { lat: rows[0].lat, lng: rows[0].lng };
  }

  const vendorName = vo.vendor.displayName;
  const vendorPhone = vo.vendor.user.phone;
  const custName = [vo.order.customer.firstName, vo.order.customer.lastName].filter(Boolean).join(" ") || "Customer";

  // The customer already paid `order.deliveryFeeMinor` into escrow at checkout.
  // Split it across the order's delivery-backed sub-orders so the ledger nets
  // exactly (distance pricing still drives ETA + the courier's *share* ratio).
  const deliveryFulfilCount = await prisma.fulfilment.count({
    where: { vendorOrder: { orderId: vo.orderId }, method: "DELIVERY" },
  });
  const capturedFeeShare = deliveryFulfilCount > 0 ? Math.round(vo.order.deliveryFeeMinor / deliveryFulfilCount) : 0;

  const { delivery } = await createDelivery({
    platformSlug: vo.order.platformSlug,
    sourceType: "FULFILMENT",
    sourceId: vo.fulfilment.id,
    customerId: vo.order.customerId,
    pickup: {
      lat: pickupPt.lat,
      lng: pickupPt.lng,
      address: { name: vendorName, ...(vo.vendor.business ? { line1: vo.vendor.business.addressLine, city: vo.vendor.business.city } : {}) },
      contact: { name: vendorName, phone: vendorPhone },
    },
    dropoff: {
      lat: dropPt.lat,
      lng: dropPt.lng,
      address: (vo.fulfilment.addressSnapshot ?? vo.order.addressSnapshot ?? {}) as Record<string, unknown>,
      contact: { name: custName, phone: vo.order.customer.phone },
    },
    items: vo.items.map((it) => ({ description: it.titleSnapshot, qty: it.qty })),
    autoDispatch: false,
  });

  // Re-base the ledger fee to what was actually captured; keep the distance-based
  // courier share ratio. Then start dispatch.
  const shareBps = env.DELIVERY_COURIER_SHARE_BPS;
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      feeMinor: capturedFeeShare,
      courierPayoutMinor: Math.round((capturedFeeShare * shareBps) / 10_000),
    },
  });

  await prisma.$transaction([
    prisma.fulfilment.update({ where: { id: vo.fulfilment.id }, data: { deliveryId: delivery.id, status: "IN_TRANSIT" } }),
    prisma.deliveryJob.updateMany({ where: { deliveryId: delivery.id }, data: { payoutMinor: Math.round((capturedFeeShare * shareBps) / 10_000) } }),
    prisma.orderEvent.create({ data: { orderId: vo.orderId, type: "DELIVERY_CREATED", actorType: "SYSTEM", data: { vendorOrderId, deliveryId: delivery.id, code: delivery.code } } }),
  ]);

  await dispatchDelivery(delivery.id).catch((e) => console.error("[dispatch] from fulfilment", e));

  return delivery.id;
}

// ------------------------------------------------------------- reads

export async function getDeliveryForCustomer(userId: string, id: string): Promise<DeliveryView> {
  const d = await loadFull(id);
  if (d.customerId !== userId) throw new AppError("NOT_FOUND", "Delivery not found");
  return shapeDelivery(d, { viewer: "customer" });
}

export async function getDeliveryForCourier(courierId: string, id: string): Promise<DeliveryView> {
  const d = await loadFull(id);
  if (d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");
  return shapeDelivery(d, { viewer: "courier" });
}

export async function getDeliveryForVendor(vendorUserId: string, id: string): Promise<DeliveryView> {
  const d = await loadFull(id);
  if (d.sourceType !== "FULFILMENT") throw new AppError("NOT_FOUND", "Delivery not found");
  const ful = await prisma.fulfilment.findUnique({
    where: { id: d.sourceId },
    include: { vendorOrder: { include: { vendor: { select: { userId: true } } } } },
  });
  if (ful?.vendorOrder.vendor.userId !== vendorUserId) throw new AppError("NOT_FOUND", "Delivery not found");
  return shapeDelivery(d, { viewer: "vendor" });
}

export async function listCustomerDeliveries(userId: string, opts: { active?: boolean; cursor?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 20)), 50);
  const rows = await prisma.delivery.findMany({
    where: { customerId: userId, ...(opts.active ? { status: { in: ACTIVE_STATES } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: fullInclude,
  });
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;
  return { items: rows.slice(0, limit).map((d) => shapeDelivery(d, { viewer: "customer" })), nextCursor };
}

export async function listCourierDeliveries(courierId: string, opts: { active?: boolean; cursor?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 20)), 50);
  const rows = await prisma.delivery.findMany({
    where: { courierId, ...(opts.active ? { status: { in: ACTIVE_STATES } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: fullInclude,
  });
  const nextCursor = rows.length > limit ? rows[limit - 1]!.id : null;
  return { items: rows.slice(0, limit).map((d) => shapeDelivery(d, { viewer: "courier" })), nextCursor };
}

// ------------------------------------------------------------- state machine

const COURIER_FORWARD: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  COURIER_ASSIGNED: "COURIER_EN_ROUTE_PICKUP",
  COURIER_EN_ROUTE_PICKUP: "ARRIVED_PICKUP",
  ARRIVED_PICKUP: "PICKED_UP",
  PICKED_UP: "EN_ROUTE_DROPOFF",
  EN_ROUTE_DROPOFF: "ARRIVED_DROPOFF",
  ARRIVED_DROPOFF: "DELIVERED",
  DELIVERED: "COMPLETED",
};

async function emit(
  tx: Prisma.TransactionClient,
  deliveryId: string,
  type: string,
  opts: { actorType?: "USER" | "SYSTEM"; actorId?: string; lat?: number; lng?: number; data?: Prisma.InputJsonValue; outbox?: string } = {},
) {
  await tx.deliveryEvent.create({
    data: { deliveryId, type, actorType: opts.actorType ?? "SYSTEM", actorId: opts.actorId, lat: opts.lat, lng: opts.lng, data: opts.data },
  });
  await tx.outboxEvent.create({
    data: { type: opts.outbox ?? `delivery.${type.toLowerCase()}`, aggregateType: "Delivery", aggregateId: deliveryId, payload: { type, ...(opts.data ? { data: opts.data } : {}) } as Prisma.InputJsonValue },
  });
}

export interface AdvanceExtra {
  lat?: number;
  lng?: number;
}

/** Courier moves the delivery one step forward along the happy path. */
export async function courierAdvanceDelivery(
  courierId: string,
  deliveryId: string,
  to: DeliveryStatus,
  extra: AdvanceExtra = {},
): Promise<DeliveryView> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { pickupVerification: true, dropoffVerification: true } });
  if (!d || d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");
  const expected = COURIER_FORWARD[d.status];
  if (to !== expected) throw new AppError("CONFLICT", `Can't move from ${d.status} to ${to}`);

  if (to === "PICKED_UP" && !d.pickupVerification?.verifiedAt) {
    throw new AppError("CONFLICT", "Verify the pickup before collecting the package");
  }
  if (to === "DELIVERED" && !d.dropoffVerification?.verifiedAt) {
    throw new AppError("CONFLICT", "Verify the drop-off before marking delivered");
  }

  if (to === "COMPLETED") return completeDelivery(courierId, deliveryId);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const patch: Prisma.DeliveryUpdateInput = { status: to };
    if (to === "PICKED_UP") patch.pickedUpAt = now;
    if (to === "COURIER_EN_ROUTE_PICKUP" || to === "EN_ROUTE_DROPOFF") {
      const dest = to === "COURIER_EN_ROUTE_PICKUP" ? { lat: d.pickupLat, lng: d.pickupLng } : { lat: d.dropoffLat, lng: d.dropoffLng };
      if (extra.lat != null && extra.lng != null) {
        const route = await estimateRoute({ lat: extra.lat, lng: extra.lng }, dest);
        patch.etaAt = etaFrom(route.durationS);
      }
    }
    await tx.delivery.update({ where: { id: deliveryId }, data: patch });
    await emit(tx, deliveryId, to, { actorType: "USER", actorId: courierId, lat: extra.lat, lng: extra.lng });
  });

  return getDeliveryForCourier(courierId, deliveryId);
}

async function completeDelivery(courierId: string, deliveryId: string): Promise<DeliveryView> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { proofOfDelivery: true } });
  if (!d || d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");
  if (d.status !== "DELIVERED") throw new AppError("CONFLICT", `Delivery is ${d.status}, not DELIVERED`);

  const courierCut = d.courierPayoutMinor;
  const platformCut = d.feeMinor - courierCut;
  let completedVendorOrderId: string | null = null;

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: deliveryId }, data: { status: "COMPLETED", completedAt: new Date() } });
    await tx.deliveryJob.updateMany({ where: { deliveryId }, data: { state: "ASSIGNED" } });

    // escrow → courier PAYABLE + platform REVENUE
    const lines = [
      { account: platformEscrow(d.platformSlug, d.currency), direction: "DEBIT" as const, amountMinor: d.feeMinor },
      ...(courierCut > 0 ? [{ account: courierPayable(courierId, d.currency), direction: "CREDIT" as const, amountMinor: courierCut }] : []),
      ...(platformCut > 0 ? [{ account: platformRevenue(d.platformSlug, d.currency), direction: "CREDIT" as const, amountMinor: platformCut }] : []),
    ];
    let ledgerTxnId: string | undefined;
    if (d.feeMinor > 0) {
      const txn = await postTxn({ type: "RELEASE", memo: `Delivery ${d.code} settlement`, reference: { deliveryId, code: d.code }, lines }, tx);
      ledgerTxnId = txn.id;
    }
    await tx.courierEarning.create({
      data: {
        courierId,
        deliveryId,
        kind: "DELIVERY",
        grossMinor: d.feeMinor,
        deductionMinor: platformCut,
        netMinor: courierCut,
        currency: d.currency,
        ledgerTxnId,
        memo: `Delivery ${d.code}`,
      },
    });

    // fulfilment → COMPLETED
    if (d.sourceType === "FULFILMENT") {
      await tx.fulfilment.updateMany({ where: { id: d.sourceId }, data: { status: "COMPLETED", completedAt: new Date() } });
      const ful = await tx.fulfilment.findUnique({ where: { id: d.sourceId } });
      if (ful) {
        completedVendorOrderId = ful.vendorOrderId;
        await tx.orderEvent.create({ data: { orderId: (await tx.vendorOrder.findUnique({ where: { id: ful.vendorOrderId } }))!.orderId, type: "DELIVERY_COMPLETED", actorType: "USER", actorId: courierId, data: { deliveryId, code: d.code } } });
      }
    }

    // courier metrics + free them up
    await tx.courierProfile.update({
      where: { id: courierId },
      data: { onlineStatus: "ONLINE", completedDeliveries: { increment: 1 } },
    });

    await emit(tx, deliveryId, "COMPLETED", { actorType: "USER", actorId: courierId, data: { courierCut, platformCut } as Prisma.InputJsonValue, outbox: "delivery.completed" });
  });

  // A verified drop-off is unambiguous proof of fulfilment — close out the
  // vendor-order (and, once every vendor-order on the parent Order is done,
  // the Order itself) right away. Outside the transaction above since it
  // opens its own; a failure here doesn't undo the now-COMPLETED delivery,
  // and is safe to retry (completeVendorOrderSystem no-ops if already done).
  if (completedVendorOrderId) {
    try {
      await completeVendorOrderSystem(completedVendorOrderId);
    } catch (e) {
      console.error("[delivery-completion] vendor-order settle failed", e);
    }
  }

  return getDeliveryForCourier(courierId, deliveryId);
}

// ------------------------------------------------------------- verification

export async function verifyPickup(
  courierId: string,
  deliveryId: string,
  input: { code?: string; method?: PickupVerifyMethod; packageCount?: number; conditionNote?: string; photoKeys?: string[] },
): Promise<DeliveryView> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { pickupVerification: true } });
  if (!d || d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");
  if (!["ARRIVED_PICKUP", "COURIER_EN_ROUTE_PICKUP"].includes(d.status)) {
    throw new AppError("CONFLICT", "Not at the pickup step yet");
  }
  const pv = d.pickupVerification;
  const method = input.method ?? pv?.method ?? "OTP";
  if (method === "OTP" || method === "QR") {
    if (!input.code || input.code.trim() !== d.pickupCode) {
      throw new AppError("VALIDATION", "That pickup code doesn't match");
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.pickupVerification.update({
      where: { deliveryId },
      data: {
        method,
        verifiedAt: new Date(),
        packageCount: input.packageCount,
        conditionNote: input.conditionNote,
        photoKeys: input.photoKeys ?? [],
      },
    });
    await emit(tx, deliveryId, "PICKUP_VERIFIED", { actorType: "USER", actorId: courierId, data: { method, packageCount: input.packageCount } as Prisma.InputJsonValue });
  });
  return getDeliveryForCourier(courierId, deliveryId);
}

export async function verifyDropoff(
  courierId: string,
  deliveryId: string,
  input: { code?: string; method?: DeliveryVerifyMethod; signatureKey?: string; photoKeys?: string[]; recipientName?: string },
): Promise<DeliveryView> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { dropoffVerification: true } });
  if (!d || d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");
  if (!["ARRIVED_DROPOFF", "EN_ROUTE_DROPOFF"].includes(d.status)) {
    throw new AppError("CONFLICT", "Not at the drop-off step yet");
  }
  const dv = d.dropoffVerification;
  const method = input.method ?? dv?.method ?? "OTP";
  if (method === "OTP" || method === "QR") {
    if (!input.code || input.code.trim() !== d.dropoffCode) {
      throw new AppError("VALIDATION", "That delivery code doesn't match");
    }
  }
  if (method === "SIGNATURE" && !input.signatureKey) throw new AppError("VALIDATION", "A signature is required");
  await prisma.$transaction(async (tx) => {
    await tx.deliveryVerification.update({
      where: { deliveryId },
      data: { method, verifiedAt: new Date(), signatureKey: input.signatureKey, photoKeys: input.photoKeys ?? [], recipientName: input.recipientName },
    });
    await tx.delivery.update({ where: { id: deliveryId }, data: { deliveredAt: new Date() } });
    await emit(tx, deliveryId, "DROPOFF_VERIFIED", { actorType: "USER", actorId: courierId, data: { method } as Prisma.InputJsonValue });
  });
  return getDeliveryForCourier(courierId, deliveryId);
}

export async function submitProofOfDelivery(
  courierId: string,
  deliveryId: string,
  input: { photoKeys: string[]; notes?: string; lat?: number; lng?: number },
): Promise<DeliveryView> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");
  await prisma.proofOfDelivery.upsert({
    where: { deliveryId },
    create: { deliveryId, photoKeys: input.photoKeys, notes: input.notes, lat: input.lat, lng: input.lng },
    update: { photoKeys: input.photoKeys, notes: input.notes, lat: input.lat, lng: input.lng },
  });
  await prisma.deliveryEvent.create({ data: { deliveryId, type: "POD_SUBMITTED", actorType: "USER", actorId: courierId } });
  return getDeliveryForCourier(courierId, deliveryId);
}

// ------------------------------------------------------------- fail / cancel / reassign

export async function courierFailDelivery(
  courierId: string,
  deliveryId: string,
  input: { reason: string; photoKeys?: string[] },
): Promise<DeliveryView> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");
  if (!["EN_ROUTE_DROPOFF", "ARRIVED_DROPOFF"].includes(d.status)) {
    throw new AppError("CONFLICT", "Can only fail a delivery that's out for drop-off");
  }
  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: deliveryId }, data: { status: "FAILED_RECIPIENT_UNAVAILABLE", cancelReason: input.reason } });
    await tx.courierProfile.update({ where: { id: courierId }, data: { onlineStatus: "ONLINE" } });
    await emit(tx, deliveryId, "FAILED_RECIPIENT_UNAVAILABLE", { actorType: "USER", actorId: courierId, data: { reason: input.reason } as Prisma.InputJsonValue, outbox: "delivery.failed" });
  });
  return getDeliveryForCourier(courierId, deliveryId);
}

export async function rescheduleDelivery(
  actorUserId: string,
  role: "customer" | "courier",
  deliveryId: string,
  scheduledFor: Date,
): Promise<DeliveryView> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { courier: true } });
  if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
  const isParty = role === "customer" ? d.customerId === actorUserId : d.courier?.userId === actorUserId;
  if (!isParty) throw new AppError("NOT_FOUND", "Delivery not found");
  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: deliveryId }, data: { status: "RESCHEDULED", scheduledFor, courierId: null } });
    await tx.deliveryOffer.updateMany({ where: { deliveryId, response: "PENDING" }, data: { response: "TIMEOUT" } });
    await emit(tx, deliveryId, "RESCHEDULED", { actorType: "USER", actorId: actorUserId, data: { scheduledFor: scheduledFor.toISOString(), by: role } as Prisma.InputJsonValue });
  });
  return shapeDelivery(await loadFull(deliveryId), { viewer: role === "customer" ? "customer" : "courier" });
}

export async function reassignDelivery(deliveryId: string, reason = "manual"): Promise<DispatchOutcome> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
  await prisma.$transaction(async (tx) => {
    if (d.courierId) await tx.courierProfile.update({ where: { id: d.courierId }, data: { onlineStatus: "ONLINE" } }).catch(() => {});
    await tx.delivery.update({
      where: { id: deliveryId },
      data: { status: "REASSIGNING", courierId: null, reassignCount: { increment: 1 }, assignedAt: null, pickedUpAt: null },
    });
    await tx.deliveryOffer.updateMany({ where: { deliveryId, response: "PENDING" }, data: { response: "TIMEOUT" } });
    await emit(tx, deliveryId, "REASSIGNING", { data: { reason } as Prisma.InputJsonValue });
  });
  const r = await dispatchDelivery(deliveryId);
  return { deliveryId, dispatch: r.status };
}

interface DispatchOutcome {
  deliveryId: string;
  dispatch: string;
}

export async function customerCancelDelivery(userId: string, deliveryId: string, reason?: string): Promise<DeliveryView> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.customerId !== userId) throw new AppError("NOT_FOUND", "Delivery not found");
  if (["PICKED_UP", "EN_ROUTE_DROPOFF", "ARRIVED_DROPOFF", "DELIVERED", "COMPLETED"].includes(d.status)) {
    throw new AppError("CONFLICT", "The package is already on its way — contact support");
  }
  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({ where: { id: deliveryId }, data: { status: "CANCELLED_BY_CUSTOMER", cancelledAt: new Date(), cancelReason: reason, courierId: null } });
    await tx.deliveryOffer.updateMany({ where: { deliveryId, response: "PENDING" }, data: { response: "TIMEOUT" } });
    await tx.deliveryJob.updateMany({ where: { deliveryId }, data: { state: "CANCELLED" } });
    if (d.courierId) await tx.courierProfile.update({ where: { id: d.courierId }, data: { onlineStatus: "ONLINE" } }).catch(() => {});
    await emit(tx, deliveryId, "CANCELLED_BY_CUSTOMER", { actorType: "USER", actorId: userId, data: { reason } as Prisma.InputJsonValue, outbox: "delivery.cancelled" });
  });
  return getDeliveryForCustomer(userId, deliveryId);
}

export async function courierCancelDelivery(courierId: string, deliveryId: string, reason: string): Promise<DispatchOutcome> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");
  if (["PICKED_UP", "EN_ROUTE_DROPOFF", "ARRIVED_DROPOFF", "DELIVERED", "COMPLETED"].includes(d.status)) {
    throw new AppError("CONFLICT", "You've already collected the package — use 'report an issue'");
  }
  await prisma.deliveryEvent.create({ data: { deliveryId, type: "CANCELLED_BY_COURIER", actorType: "USER", actorId: courierId, data: { reason } } });
  // drop the assignment + re-dispatch to someone else
  return reassignDelivery(deliveryId, `courier_cancelled:${reason}`);
}

// ------------------------------------------------------------- ratings + disputes

export async function rateDelivery(
  byUserId: string,
  deliveryId: string,
  role: "CUSTOMER" | "COURIER",
  input: { stars: number; tags?: string[]; comment?: string },
): Promise<{ ok: true }> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { courier: true } });
  if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
  if (d.status !== "COMPLETED" && d.status !== "DELIVERED") throw new AppError("CONFLICT", "You can rate once the delivery is done");
  if (role === "CUSTOMER" && d.customerId !== byUserId) throw new AppError("FORBIDDEN", "Not your delivery");
  if (role === "COURIER" && d.courier?.userId !== byUserId) throw new AppError("FORBIDDEN", "Not your delivery");
  const stars = Math.min(5, Math.max(1, Math.round(input.stars)));

  await prisma.$transaction(async (tx) => {
    await tx.deliveryRating.upsert({
      where: { deliveryId_role: { deliveryId, role } },
      create: { deliveryId, byUserId, role, stars, tags: input.tags ?? [], comment: input.comment },
      update: { stars, tags: input.tags ?? [], comment: input.comment },
    });
    // when the customer rates the courier, roll the courier's average
    if (role === "CUSTOMER" && d.courierId) {
      const agg = await tx.deliveryRating.aggregate({
        where: { delivery: { courierId: d.courierId }, role: "CUSTOMER" },
        _avg: { stars: true },
        _count: true,
      });
      await tx.courierProfile.update({
        where: { id: d.courierId },
        data: { ratingAvg: agg._avg.stars ?? stars, ratingCount: agg._count },
      });
    }
    await emit(tx, deliveryId, "RATED", { actorType: "USER", actorId: byUserId, data: { role, stars } as Prisma.InputJsonValue });
  });
  return { ok: true };
}

export async function openDeliveryDispute(
  userId: string,
  deliveryId: string,
  input: { category: string; body: string; evidence?: unknown },
): Promise<{ id: string; status: string }> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { courier: true } });
  if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
  const isParty = d.customerId === userId || d.courier?.userId === userId;
  if (!isParty) throw new AppError("FORBIDDEN", "Not your delivery");
  const dispute = await prisma.deliveryDispute.create({
    data: { deliveryId, openedById: userId, category: input.category, body: input.body, evidence: (input.evidence ?? undefined) as Prisma.InputJsonValue },
  });
  await prisma.deliveryEvent.create({ data: { deliveryId, type: "DISPUTE_OPENED", actorType: "USER", actorId: userId, data: { category: input.category } } });
  return { id: dispute.id, status: dispute.status };
}

// ------------------------------------------------------------- breadcrumbs / track

/** Ingested from `/tracking`. Throttled write; always updates courier presence. */
export async function recordBreadcrumb(
  courierId: string,
  deliveryId: string,
  point: { lat: number; lng: number; heading?: number; speed?: number; accuracy?: number },
): Promise<{ stored: boolean; etaAt: string | null }> {
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId }, select: { courierId: true, status: true, platformSlug: true, vehicleType: true, pickupLat: true, pickupLng: true, dropoffLat: true, dropoffLng: true } });
  if (!d || d.courierId !== courierId) throw new AppError("NOT_FOUND", "Delivery not found");

  await upsertCourierPresence({
    courierId,
    platformSlug: d.platformSlug,
    lat: point.lat,
    lng: point.lng,
    vehicleType: d.vehicleType,
    onJob: true,
  });

  const last = await prisma.deliveryLocation.findFirst({ where: { deliveryId }, orderBy: { at: "desc" } });
  const stored = !last || Date.now() - last.at.getTime() >= BREADCRUMB_MIN_GAP_MS;
  if (stored) {
    await prisma.deliveryLocation.create({
      data: { deliveryId, courierId, lat: point.lat, lng: point.lng, heading: point.heading, speed: point.speed, accuracy: point.accuracy },
    });
  }

  // refresh ETA toward the current leg's destination
  let etaAt: Date | null = null;
  if (["COURIER_EN_ROUTE_PICKUP", "ARRIVED_PICKUP"].includes(d.status)) {
    etaAt = etaFrom((await estimateRoute(point, { lat: d.pickupLat, lng: d.pickupLng })).durationS);
  } else if (["PICKED_UP", "EN_ROUTE_DROPOFF", "ARRIVED_DROPOFF"].includes(d.status)) {
    etaAt = etaFrom((await estimateRoute(point, { lat: d.dropoffLat, lng: d.dropoffLng })).durationS);
  }
  if (etaAt) await prisma.delivery.update({ where: { id: deliveryId }, data: { etaAt } });

  return { stored, etaAt: etaAt?.toISOString() ?? null };
}

export async function getDeliveryTrack(deliveryId: string, viewerUserId: string) {
  const d = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { courier: { include: { user: true } }, breadcrumbs: { orderBy: { at: "desc" }, take: 60 } },
  });
  if (!d) throw new AppError("NOT_FOUND", "Delivery not found");
  if (d.customerId !== viewerUserId && d.courier?.userId !== viewerUserId) throw new AppError("NOT_FOUND", "Delivery not found");
  const latest = d.breadcrumbs[0];

  // Road route for the leg the courier is currently on: from wherever they are
  // (or the pickup, pre-assignment) to the point they're headed for.
  const headingToDropoff = ["PICKED_UP", "EN_ROUTE_DROPOFF", "ARRIVED_DROPOFF", "DELIVERED"].includes(d.status);
  const from = latest ? { lat: latest.lat, lng: latest.lng } : { lat: d.pickupLat, lng: d.pickupLng };
  const to = headingToDropoff ? { lat: d.dropoffLat, lng: d.dropoffLng } : { lat: d.pickupLat, lng: d.pickupLng };
  const isFinal = ["DELIVERED", "CANCELLED_BY_CUSTOMER", "CANCELLED_BY_COURIER", "CANCELLED_BY_SYSTEM"].includes(d.status);
  const route = isFinal ? null : await estimateRoute(from, to).catch(() => null);

  return {
    status: d.status,
    etaAt: d.etaAt?.toISOString() ?? null,
    pickup: { lat: d.pickupLat, lng: d.pickupLng },
    dropoff: { lat: d.dropoffLat, lng: d.dropoffLng },
    courier: latest ? { lat: latest.lat, lng: latest.lng, heading: latest.heading, at: latest.at.toISOString() } : null,
    routePolyline: route?.polyline ?? null,
    trail: d.breadcrumbs
      .slice(0, 25)
      .reverse()
      .map((b) => ({ lat: b.lat, lng: b.lng, at: b.at.toISOString() })),
    distanceRemainingM: route?.distanceM ?? (latest ? haversineM(from, to) : d.distanceM),
  };
}
