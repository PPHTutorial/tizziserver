import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { delivery, couriers, wallet } from "@stall/core";
import { balanceOf, courierPayable, platformEscrow, platformRevenue } from "../src/wallet/ledger.ts";
import { upsertCourierPresence } from "../src/delivery/presence.ts";
import { dropUser, makeUser } from "./helpers.ts";

const PLATFORM = "grandprice";
const trash: string[] = [];
const trashDeliveries: string[] = [];

// seeded grandprice courier (Kofi Mensah) — near the Accra businesses
let courierUserId = "";
let courierId = "";

async function newCustomer() {
  const u = await makeUser("CUSTOMER");
  trash.push(u.id);
  return u.id;
}

/** Keep the seeded courier fresh in the dispatch index (Redis GEO + DB projection). */
async function refreshCourier() {
  await prisma.courierProfile.update({ where: { id: courierId }, data: { onlineStatus: "ONLINE" } });
  await upsertCourierPresence({ courierId, platformSlug: PLATFORM, lat: 5.606, lng: -0.19, vehicleType: "MOTORBIKE" });
}

beforeAll(async () => {
  const c = await prisma.courierProfile.findFirst({
    where: { user: { phone: "+233200000010" } },
    include: { user: true },
  });
  if (!c) throw new Error("seed the DB first: pnpm --filter @stall/db seed");
  courierId = c.id;
  courierUserId = c.userId;
});

afterAll(async () => {
  for (const id of trashDeliveries) {
    await prisma.delivery.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const id of trash) {
    await prisma.order.deleteMany({ where: { customerId: id } }).catch(() => {});
    const w = await prisma.wallet.findUnique({ where: { userId: id } });
    if (w) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { userId: id } }).catch(() => {});
    }
    await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: id } });
    await prisma.deliveryRating.deleteMany({ where: { byUserId: id } });
    await dropUser(id).catch(() => {});
  }
  // reset the seeded courier to a clean-ish state
  await prisma.delivery.deleteMany({ where: { courierId, code: { startsWith: "DLV-" }, status: { in: ["COMPLETED", "CANCELLED_BY_SYSTEM"] } } }).catch(() => {});
  await prisma.courierProfile.update({ where: { id: courierId }, data: { onlineStatus: "ONLINE" } }).catch(() => {});
  await prisma.$disconnect();
});

describe("delivery pricing", () => {
  it("prices from the seeded DELIVERY PricingRule + courier share", async () => {
    const q = await delivery.quoteDeliveryFee({ platformSlug: PLATFORM, distanceM: 5000, durationS: 900, vehicleType: "MOTORBIKE" });
    // seed params: base 1000, perKm 200, perMin 30, min 1500 → 1000 + 200*5 + 30*15 = 2450 → round10
    expect(q.feeMinor).toBe(2450);
    expect(q.currency).toBe("GHS");
    // COURIER PAYOUT FeeSchedule percent = 80
    expect(q.courierPayoutMinor).toBe(Math.round((2450 * 8000) / 10_000));
  });

  it("enforces the minimum fee for a tiny hop", async () => {
    const q = await delivery.quoteDeliveryFee({ platformSlug: PLATFORM, distanceM: 200, durationS: 120 });
    expect(q.feeMinor).toBe(1500);
  });
});

describe("adhoc delivery — full lifecycle + ledger", () => {
  it("dispatch → accept → pickup OTP → dropoff OTP → complete, reconciled", async () => {
    await refreshCourier();
    const userId = await newCustomer();
    await wallet.topUpWallet({ userId, amountMinor: 50_000, platformSlug: PLATFORM, gateway: "mock" });

    const created = await delivery.createDelivery({
      platformSlug: PLATFORM,
      sourceType: "ADHOC",
      sourceId: userId,
      customerId: userId,
      pickup: { lat: 5.6037, lng: -0.187, address: { line1: "Accra Mall" }, contact: { name: "Shop", phone: "+233200000900" } },
      dropoff: { lat: 5.62, lng: -0.17, address: { line1: "East Legon" }, contact: { name: "Me", phone: "+233200000901" } },
      items: [{ description: "Parcel", qty: 1 }],
      payment: { method: "wallet", userId },
    });
    const dId = created.delivery.id;
    trashDeliveries.push(dId);
    expect(created.pickupOtp).toMatch(/^\d{4}$/);
    expect(created.dropoffOtp).toMatch(/^\d{4}$/);
    expect(created.delivery.feeMinor).toBeGreaterThan(0);

    const escrowBefore = await balanceOf(platformEscrow(PLATFORM));
    const revenueBefore = await balanceOf(platformRevenue(PLATFORM));
    const courierBefore = await balanceOf(courierPayable(courierId));

    // fee captured into escrow on creation
    expect(escrowBefore).toBeGreaterThanOrEqual(created.delivery.feeMinor);

    // an offer should have gone to the seeded courier
    let d = await prisma.delivery.findUniqueOrThrow({ where: { id: dId }, include: { offers: true } });
    expect(d.status).toBe("SEARCHING_COURIER");
    const offer = d.offers.find((o) => o.courierId === courierId && o.response === "PENDING");
    expect(offer, "seeded courier should get the offer").toBeTruthy();

    // accept
    const acc = await delivery.respondToOffer(courierId, offer!.id, "ACCEPTED");
    expect(acc.status).toBe("COURIER_ASSIGNED");

    // walk the state machine
    await delivery.courierAdvanceDelivery(courierId, dId, "COURIER_EN_ROUTE_PICKUP", { lat: 5.606, lng: -0.19 });
    await delivery.courierAdvanceDelivery(courierId, dId, "ARRIVED_PICKUP");

    // wrong pickup code rejected, right one accepted
    await expect(delivery.verifyPickup(courierId, dId, { code: "0000" })).rejects.toThrow();
    await delivery.verifyPickup(courierId, dId, { code: created.pickupOtp, packageCount: 1 });

    await delivery.courierAdvanceDelivery(courierId, dId, "PICKED_UP");
    await delivery.courierAdvanceDelivery(courierId, dId, "EN_ROUTE_DROPOFF", { lat: 5.61, lng: -0.18 });
    await delivery.courierAdvanceDelivery(courierId, dId, "ARRIVED_DROPOFF");

    await expect(delivery.verifyDropoff(courierId, dId, { code: "9999" })).rejects.toThrow();
    await delivery.verifyDropoff(courierId, dId, { code: created.dropoffOtp, recipientName: "Me" });
    await delivery.courierAdvanceDelivery(courierId, dId, "DELIVERED");
    await delivery.submitProofOfDelivery(courierId, dId, { photoKeys: ["pod/1.jpg"], notes: "left at door" });

    const done = await delivery.courierAdvanceDelivery(courierId, dId, "COMPLETED");
    expect(done.status).toBe("COMPLETED");

    // ledger: escrow -fee, courier +payout, platform +remainder
    const fee = created.delivery.feeMinor;
    const payout = created.delivery.courierPayoutMinor!;
    const escrowAfter = await balanceOf(platformEscrow(PLATFORM));
    const revenueAfter = await balanceOf(platformRevenue(PLATFORM));
    const courierAfter = await balanceOf(courierPayable(courierId));
    expect(escrowBefore - escrowAfter).toBe(fee);
    expect(courierAfter - courierBefore).toBe(payout);
    expect(revenueAfter - revenueBefore).toBe(fee - payout);

    const earning = await prisma.courierEarning.findFirst({ where: { deliveryId: dId } });
    expect(earning?.netMinor).toBe(payout);

    // courier is freed
    const cp = await prisma.courierProfile.findUniqueOrThrow({ where: { id: courierId } });
    expect(cp.onlineStatus).toBe("ONLINE");

    // ratings roll the courier average
    await delivery.rateDelivery(userId, dId, "CUSTOMER", { stars: 5, tags: ["fast"] });
    const cp2 = await prisma.courierProfile.findUniqueOrThrow({ where: { id: courierId } });
    expect(cp2.ratingCount).toBeGreaterThan(0);
  });
});

describe("dispatch waterfall", () => {
  it("a decline advances the waterfall (and runs dry with one courier)", async () => {
    await refreshCourier();
    const userId = await newCustomer();
    await wallet.topUpWallet({ userId, amountMinor: 20_000, platformSlug: PLATFORM, gateway: "mock" });
    const c = await delivery.createDelivery({
      platformSlug: PLATFORM,
      sourceType: "ADHOC",
      sourceId: userId,
      customerId: userId,
      pickup: { lat: 5.6037, lng: -0.187, address: {} },
      dropoff: { lat: 5.61, lng: -0.18, address: {} },
      payment: { method: "wallet", userId },
    });
    trashDeliveries.push(c.delivery.id);
    const d = await prisma.delivery.findUniqueOrThrow({ where: { id: c.delivery.id }, include: { offers: true } });
    const offer = d.offers.find((o) => o.response === "PENDING");
    expect(offer).toBeTruthy();

    const res = await delivery.respondToOffer(courierId, offer!.id, "DECLINED", "too far");
    expect(res.status).toBe("SEARCHING_COURIER");

    const after = await prisma.delivery.findUniqueOrThrow({ where: { id: c.delivery.id }, include: { offers: true } });
    expect(after.offers.find((o) => o.id === offer!.id)!.response).toBe("DECLINED");
    // only one courier seeded → no live offer left
    expect(after.offers.some((o) => o.response === "PENDING" && o.expiresAt > new Date())).toBe(false);
    expect(after.status).toBe("SEARCHING_COURIER");
  });

  it("courier cancel before pickup re-opens dispatch", async () => {
    await refreshCourier();
    const userId = await newCustomer();
    await wallet.topUpWallet({ userId, amountMinor: 20_000, platformSlug: PLATFORM, gateway: "mock" });
    const c = await delivery.createDelivery({
      platformSlug: PLATFORM,
      sourceType: "ADHOC",
      sourceId: userId,
      customerId: userId,
      pickup: { lat: 5.6037, lng: -0.187, address: {} },
      dropoff: { lat: 5.61, lng: -0.18, address: {} },
      payment: { method: "wallet", userId },
    });
    trashDeliveries.push(c.delivery.id);
    const d = await prisma.delivery.findUniqueOrThrow({ where: { id: c.delivery.id }, include: { offers: true } });
    await delivery.respondToOffer(courierId, d.offers.find((o) => o.response === "PENDING")!.id, "ACCEPTED");
    await delivery.courierAdvanceDelivery(courierId, c.delivery.id, "COURIER_EN_ROUTE_PICKUP");

    const out = await delivery.courierCancelDelivery(courierId, c.delivery.id, "bike broke down");
    expect(out.deliveryId).toBe(c.delivery.id);
    const after = await prisma.delivery.findUniqueOrThrow({ where: { id: c.delivery.id } });
    expect(["REASSIGNING", "SEARCHING_COURIER"]).toContain(after.status);
    expect(after.courierId).toBeNull();
    expect(after.reassignCount).toBe(1);
  });
});

describe("fulfilment-sourced delivery keeps the order ledger balanced", () => {
  it("spawns from READY_FOR_PICKUP and settles without double-releasing the delivery fee", async () => {
    await refreshCourier();
    const { commerce } = await import("@stall/core");
    const userId = await newCustomer();
    await wallet.topUpWallet({ userId, amountMinor: 500_000, platformSlug: PLATFORM, gateway: "mock" });

    // one-vendor delivery order
    const offer = await prisma.vendorOffer.findFirstOrThrow({ where: { product: { slug: "orbit-a54-phone" }, status: "ACTIVE" }, orderBy: { priceMinor: "asc" } });
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offer.id, qty: 1 });
    const addr = await commerce.createAddress(userId, {
      recipientName: "Test Buyer",
      phone: "+233200000777",
      line1: "12 Liberation Rd",
      city: "Accra",
      country: "GH",
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "addresses" SET "location" = ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE "id" = $3`,
      -0.17,
      5.62,
      addr.id,
    );

    const order = await commerce.placeOrder({ userId, platformSlug: PLATFORM, addressId: addr.id, fulfilmentMethod: "DELIVERY", payment: { method: "wallet" } });
    const vo = order.vendorOrders[0]!;

    const escrowBefore = await balanceOf(platformEscrow(PLATFORM));
    const revenueBefore = await balanceOf(platformRevenue(PLATFORM));
    const courierBefore = await balanceOf(courierPayable(courierId));

    // vendor accepts → ready → spawns the delivery
    const vendorUserId = (await prisma.vendorProfile.findUniqueOrThrow({ where: { id: vo.vendorId }, select: { userId: true } })).userId;
    await commerce.setVendorOrderStatus(vendorUserId, vo.id, "ACCEPTED");
    await commerce.setVendorOrderStatus(vendorUserId, vo.id, "PREPARING");
    const ready = await commerce.setVendorOrderStatus(vendorUserId, vo.id, "READY_FOR_PICKUP");
    expect(ready.deliveryId, "delivery spawned").toBeTruthy();
    trashDeliveries.push(ready.deliveryId!);

    const ful = await prisma.fulfilment.findUniqueOrThrow({ where: { vendorOrderId: vo.id } });
    expect(ful.status).toBe("IN_TRANSIT");
    const dId = ready.deliveryId!;
    const dRow = await prisma.delivery.findUniqueOrThrow({ where: { id: dId }, include: { offers: true } });
    // fee re-based to the captured share of order.deliveryFeeMinor
    expect(dRow.feeMinor).toBe(order.deliveryFeeMinor);

    // courier runs it
    const off = dRow.offers.find((o) => o.response === "PENDING");
    expect(off).toBeTruthy();
    await delivery.respondToOffer(courierId, off!.id, "ACCEPTED");
    const full = await delivery.getDeliveryForCourier(courierId, dId);
    const custView = await delivery.getDeliveryForCustomer(userId, dId);
    expect(custView.dropoffCode).toMatch(/^\d{4}$/); // customer sees the dropoff code
    expect(custView.pickupCode).toBeUndefined();

    await delivery.courierAdvanceDelivery(courierId, dId, "COURIER_EN_ROUTE_PICKUP");
    await delivery.courierAdvanceDelivery(courierId, dId, "ARRIVED_PICKUP");
    const vendorView = await delivery.getDeliveryForVendor(vendorUserId, dId);
    await delivery.verifyPickup(courierId, dId, { code: vendorView.pickupCode! });
    await delivery.courierAdvanceDelivery(courierId, dId, "PICKED_UP");
    await delivery.courierAdvanceDelivery(courierId, dId, "EN_ROUTE_DROPOFF");
    await delivery.courierAdvanceDelivery(courierId, dId, "ARRIVED_DROPOFF");
    await delivery.verifyDropoff(courierId, dId, { code: custView.dropoffCode! });
    await delivery.courierAdvanceDelivery(courierId, dId, "DELIVERED");
    await delivery.courierAdvanceDelivery(courierId, dId, "COMPLETED");

    // sub-order completes → order fee release must NOT re-release the delivery fee
    await commerce.completeVendorOrder(vendorUserId, vo.id);

    const escrowAfter = await balanceOf(platformEscrow(PLATFORM));
    const courierAfter = await balanceOf(courierPayable(courierId));
    const revenueAfter = await balanceOf(platformRevenue(PLATFORM));

    const payout = Math.round((order.deliveryFeeMinor * 8000) / 10_000);
    expect(courierAfter - courierBefore).toBe(payout);
    // escrow fully drains for a completed single-vendor order
    const totalHeld = order.totalMinor;
    expect(escrowBefore - escrowAfter).toBe(totalHeld);
    // platform revenue = commission + (serviceFee + tax) + (deliveryFee - courierPayout)
    const expectedRevenue =
      order.vendorOrders[0]!.commissionMinor + order.serviceFeeMinor + order.taxMinor + (order.deliveryFeeMinor - payout);
    expect(revenueAfter - revenueBefore).toBe(expectedRevenue);

    const finalOrder = await commerce.getOrder(userId, order.id);
    expect(finalOrder.status).toBe("FULFILLED");
  });
});

describe("tenant isolation", () => {
  it("a tizzi-gas courier handles a tizzi-gas delivery the same way", async () => {
    const gasCourier = await prisma.courierProfile.findFirstOrThrow({ where: { user: { phone: "+233200000011" } } });
    await prisma.courierProfile.update({ where: { id: gasCourier.id }, data: { onlineStatus: "ONLINE" } });
    await upsertCourierPresence({ courierId: gasCourier.id, platformSlug: "tizzi-gas", lat: 5.588, lng: -0.208, vehicleType: "MOTORBIKE" });

    const userId = await newCustomer();
    await wallet.topUpWallet({ userId, amountMinor: 20_000, platformSlug: "tizzi-gas", gateway: "mock" });
    const c = await delivery.createDelivery({
      platformSlug: "tizzi-gas",
      sourceType: "ADHOC",
      sourceId: userId,
      customerId: userId,
      pickup: { lat: 5.585, lng: -0.205, address: {} },
      dropoff: { lat: 5.59, lng: -0.2, address: {} },
      payment: { method: "wallet", userId },
    });
    trashDeliveries.push(c.delivery.id);
    const d = await prisma.delivery.findUniqueOrThrow({ where: { id: c.delivery.id }, include: { offers: true } });
    expect(d.offers.some((o) => o.courierId === gasCourier.id)).toBe(true);
    // the grandprice courier must NOT be offered a tizzi-gas job
    expect(d.offers.some((o) => o.courierId === courierId)).toBe(false);
  });
});
