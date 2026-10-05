/**
 * MVP purchase path, end to end at the core layer (no HTTP server needed):
 *
 *   cart → coupon → quote → placeOrder (MockGateway capture) → vendor prep
 *   → delivery spawn + courier run + verified drop-off → auto-completion
 *   → escrow fully drained, payouts/revenue booked, invoice issued.
 *
 * Plus the guard rails around it: who may act on an order, forward-only
 * vendor states, stale prices, stock-checked holds, and cancel/refund.
 *
 * Runs on tizzi-gas: every seeded grandprice item is above the free-delivery
 * threshold, so only a gas item exercises a non-zero delivery fee + coupon.
 * Requires the seed (swiftgas-regulator-kit, GASWELCOME, gas courier +233200000011).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { commerce, delivery } from "@stall/core";
import { upsertCourierPresence } from "../src/delivery/presence.ts";
import { balanceOf, courierPayable, platformEscrow, platformRevenue, vendorPayable } from "../src/wallet/ledger.ts";
import { dropUser, makeUser } from "./helpers.ts";

const PLATFORM = "tizzi-gas";
const trash: string[] = [];
const trashDeliveries: string[] = [];

let offerId = "";
let vendorId = "";
let vendorUserId = "";
let otherVendorUserId = "";
let courierId = "";

async function newCustomer() {
  const u = await makeUser("CUSTOMER");
  trash.push(u.id);
  return u.id;
}

async function addressFor(userId: string) {
  const addr = await commerce.createAddress(userId, {
    recipientName: "Path Buyer",
    phone: "+233200000778",
    line1: "3 Ring Rd",
    city: "Accra",
    country: "GH",
  });
  await prisma.$executeRawUnsafe(
    `UPDATE "addresses" SET "location" = ST_SetSRID(ST_MakePoint($1,$2),4326)::geography WHERE "id" = $3`,
    -0.2,
    5.59,
    addr.id,
  );
  return addr.id;
}

async function placeGatewayOrder(userId: string, opts: { method?: "DELIVERY" | "PICKUP"; coupon?: string } = {}) {
  const method = opts.method ?? "DELIVERY";
  await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId, qty: 1 });
  return commerce.placeOrder({
    userId,
    platformSlug: PLATFORM,
    fulfilmentMethod: method,
    addressId: method === "DELIVERY" ? await addressFor(userId) : undefined,
    couponCode: opts.coupon,
    payment: { method: "gateway", gateway: "mock" },
  });
}

beforeAll(async () => {
  const offer = await prisma.vendorOffer.findFirstOrThrow({
    where: { product: { slug: "swiftgas-regulator-kit" }, status: "ACTIVE" },
    include: { vendor: { select: { userId: true } } },
  });
  offerId = offer.id;
  vendorId = offer.vendorId;
  vendorUserId = offer.vendor.userId;
  otherVendorUserId = (await prisma.vendorProfile.findFirstOrThrow({ where: { id: { not: vendorId }, deletedAt: null } })).userId;
  courierId = (await prisma.courierProfile.findFirstOrThrow({ where: { user: { phone: "+233200000011" } } })).id;
});

afterAll(async () => {
  for (const id of trashDeliveries) {
    await prisma.courierEarning.deleteMany({ where: { deliveryId: id } }).catch(() => {});
    await prisma.delivery.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const userId of trash) {
    await prisma.couponRedemption.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.order.deleteMany({ where: { customerId: userId } }).catch(() => {});
    await prisma.cart.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.paymentIntent.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.address.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: userId } }).catch(() => {});
    await dropUser(userId).catch(() => {});
  }
  await prisma.courierProfile.update({ where: { id: courierId }, data: { onlineStatus: "ONLINE" } }).catch(() => {});
  await prisma.$disconnect();
});

describe("happy path: gateway-paid delivery order with a coupon", () => {
  it("captures, dispatches, delivers, auto-completes and drains escrow exactly", async () => {
    const userId = await newCustomer();

    const escrowBefore = await balanceOf(platformEscrow(PLATFORM));
    const revenueBefore = await balanceOf(platformRevenue(PLATFORM));
    const vendorBefore = await balanceOf(vendorPayable(vendorId));
    const courierBefore = await balanceOf(courierPayable(courierId));

    // cart + quote
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId, qty: 1 });
    const quote = await commerce.quoteCheckout({ userId, platformSlug: PLATFORM, fulfilmentMethod: "DELIVERY", couponCode: "GASWELCOME" });
    expect(quote.couponValid).toBe(true);
    expect(quote.discountMinor).toBeGreaterThan(0);
    expect(quote.deliveryFeeMinor).toBeGreaterThan(0);
    expect(quote.totalMinor).toBe(
      quote.itemsSubtotalMinor - quote.discountMinor + quote.deliveryFeeMinor + quote.serviceFeeMinor + quote.taxMinor,
    );

    // place + pay through the MockGateway
    const order = await commerce.placeOrder({
      userId,
      platformSlug: PLATFORM,
      fulfilmentMethod: "DELIVERY",
      addressId: await addressFor(userId),
      couponCode: "GASWELCOME",
      payment: { method: "gateway", gateway: "mock" },
    });
    expect(order.status).toBe("PLACED");
    expect(order.totalMinor).toBe(quote.totalMinor);
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id }, include: { payments: true } });
    expect(intent.status).toBe("SUCCEEDED");
    expect(intent.payments[0]?.capturedMinor).toBe(order.totalMinor);
    expect(await balanceOf(platformEscrow(PLATFORM))).toBe(escrowBefore + order.totalMinor);
    expect((await commerce.getCart({ userId, platformSlug: PLATFORM })).itemCount).toBe(0);

    // vendor prep → READY spawns a delivery carrying the captured delivery fee
    const vo = order.vendorOrders[0]!;
    await commerce.setVendorOrderStatus(vendorUserId, vo.id, "ACCEPTED");
    await commerce.setVendorOrderStatus(vendorUserId, vo.id, "PREPARING");
    // a delivery sub-order can't be self-completed by the vendor
    await expect(commerce.completeVendorOrder(vendorUserId, vo.id)).rejects.toMatchObject({ code: "CONFLICT" });

    const ready = await commerce.setVendorOrderStatus(vendorUserId, vo.id, "READY_FOR_PICKUP");
    expect(ready.deliveryId).toBeTruthy();
    const dId = ready.deliveryId!;
    trashDeliveries.push(dId);
    let d = await prisma.delivery.findUniqueOrThrow({ where: { id: dId }, include: { offers: true } });
    expect(d.feeMinor).toBe(order.deliveryFeeMinor);

    // make sure our courier gets the job, wherever the vendor's pickup point is
    if (!d.offers.some((o) => o.courierId === courierId && o.response === "PENDING")) {
      await prisma.courierProfile.update({ where: { id: courierId }, data: { onlineStatus: "ONLINE" } });
      await upsertCourierPresence({ courierId, platformSlug: PLATFORM, lat: d.pickupLat, lng: d.pickupLng, vehicleType: "MOTORBIKE" });
      await delivery.reassignDelivery(dId, "test");
      d = await prisma.delivery.findUniqueOrThrow({ where: { id: dId }, include: { offers: true } });
    }
    const offer = d.offers.find((o) => o.courierId === courierId && o.response === "PENDING");
    expect(offer, "courier offered the job").toBeTruthy();
    await delivery.respondToOffer(courierId, offer!.id, "ACCEPTED");

    const custView = await delivery.getDeliveryForCustomer(userId, dId);
    const vendorView = await delivery.getDeliveryForVendor(vendorUserId, dId);
    await delivery.courierAdvanceDelivery(courierId, dId, "COURIER_EN_ROUTE_PICKUP");
    await delivery.courierAdvanceDelivery(courierId, dId, "ARRIVED_PICKUP");
    await delivery.verifyPickup(courierId, dId, { code: vendorView.pickupCode! });
    await delivery.courierAdvanceDelivery(courierId, dId, "PICKED_UP");
    await delivery.courierAdvanceDelivery(courierId, dId, "EN_ROUTE_DROPOFF");
    await delivery.courierAdvanceDelivery(courierId, dId, "ARRIVED_DROPOFF");
    await delivery.verifyDropoff(courierId, dId, { code: custView.dropoffCode! });
    await delivery.courierAdvanceDelivery(courierId, dId, "DELIVERED");
    await delivery.courierAdvanceDelivery(courierId, dId, "COMPLETED");

    // the verified drop-off completes the sub-order and the order on its own
    const done = await commerce.getOrder(userId, order.id);
    expect(done.status).toBe("FULFILLED");
    expect(done.vendorOrders[0]!.status).toBe("COMPLETED");
    expect(await prisma.invoice.findUnique({ where: { orderId: order.id } })).not.toBeNull();
    // and a fulfilled order can no longer be cancelled
    await expect(commerce.cancelOrder(userId, order.id)).rejects.toMatchObject({ code: "CONFLICT" });

    // money: escrow nets to zero for this order; every party got its share
    const courierCut = d.courierPayoutMinor;
    expect(await balanceOf(platformEscrow(PLATFORM))).toBe(escrowBefore);
    expect((await balanceOf(vendorPayable(vendorId))) - vendorBefore).toBe(vo.payoutMinor);
    expect((await balanceOf(courierPayable(courierId))) - courierBefore).toBe(courierCut);
    // platform-funded coupon comes out of platform revenue
    expect((await balanceOf(platformRevenue(PLATFORM))) - revenueBefore).toBe(
      vo.commissionMinor + order.serviceFeeMinor + order.taxMinor + (order.deliveryFeeMinor - courierCut) - order.discountMinor,
    );
  });
});

describe("who may act on an order", () => {
  it("scopes orders to their customer and sub-orders to their vendor", async () => {
    const userId = await newCustomer();
    const stranger = await newCustomer();
    const order = await placeGatewayOrder(userId, { method: "PICKUP" });
    const vo = order.vendorOrders[0]!;

    await expect(commerce.getOrder(stranger, order.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(commerce.cancelOrder(stranger, order.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(commerce.getVendorOrder(otherVendorUserId, vo.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(commerce.setVendorOrderStatus(otherVendorUserId, vo.id, "ACCEPTED")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(commerce.completeVendorOrder(otherVendorUserId, vo.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // a plain customer isn't a vendor at all
    await expect(commerce.completeVendorOrder(stranger, vo.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect((await commerce.getOrder(userId, order.id)).status).toBe("PLACED");
  });

  it("vendor states only move forward, and a cancelled order can't be prepared or completed", async () => {
    const userId = await newCustomer();
    const order = await placeGatewayOrder(userId, { method: "PICKUP" });
    const vo = order.vendorOrders[0]!;

    await commerce.setVendorOrderStatus(vendorUserId, vo.id, "ACCEPTED");
    // idempotent retry is fine
    await expect(commerce.setVendorOrderStatus(vendorUserId, vo.id, "ACCEPTED")).resolves.toMatchObject({ status: "ACCEPTED" });

    const cancelled = await commerce.cancelOrder(userId, order.id);
    expect(cancelled.status).toBe("REFUNDED");
    await expect(commerce.setVendorOrderStatus(vendorUserId, vo.id, "PREPARING")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(commerce.completeVendorOrder(vendorUserId, vo.id)).rejects.toMatchObject({ code: "CONFLICT" });

    const userId2 = await newCustomer();
    const order2 = await placeGatewayOrder(userId2, { method: "PICKUP" });
    const vo2 = order2.vendorOrders[0]!;
    await commerce.setVendorOrderStatus(vendorUserId, vo2.id, "PREPARING");
    await expect(commerce.setVendorOrderStatus(vendorUserId, vo2.id, "ACCEPTED")).rejects.toMatchObject({ code: "CONFLICT" });
    // once preparing, the buyer can no longer cancel
    await expect(commerce.cancelOrder(userId2, order2.id)).rejects.toMatchObject({ code: "CONFLICT" });
    // pickup orders are completed by the vendor
    await expect(commerce.completeVendorOrder(vendorUserId, vo2.id)).resolves.toMatchObject({ status: "COMPLETED" });
    expect((await commerce.getOrder(userId2, order2.id)).status).toBe("FULFILLED");
  });
});

describe("checkout guard rails", () => {
  it("refuses a stale cart price, refreshes it, and charges the live price on retry", async () => {
    const userId = await newCustomer();
    const cart = await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId, qty: 1 });
    const item = cart.groups[0]!.items[0]!;
    // simulate the seller having changed the price since this was added
    await prisma.cartItem.update({ where: { id: item.id }, data: { unitPriceMinor: item.unitPriceMinor - 1000 } });

    const place = () =>
      commerce.placeOrder({ userId, platformSlug: PLATFORM, fulfilmentMethod: "PICKUP", payment: { method: "gateway", gateway: "mock" } });
    await expect(place()).rejects.toMatchObject({ code: "CONFLICT", details: { reason: "PRICE_CHANGED" } });
    expect(await prisma.order.count({ where: { customerId: userId } })).toBe(0);

    const order = await place();
    expect(order.itemsSubtotalMinor).toBe(item.currentUnitPriceMinor);
  });

  it("holds stock atomically for variant lines and releases it exactly once on cancel", async () => {
    // the seeded cylinder exchange has tracked stock (Inventory rows)
    const stocked = await prisma.inventory.findFirstOrThrow({
      where: { variant: { product: { slug: "swiftgas-12kg-exchange" } } },
      include: { variant: true },
    });
    const variant = stocked.variant;
    const stockVendorId = stocked.vendorId;
    const offerId = (
      await prisma.vendorOffer.findFirstOrThrow({ where: { productId: variant.productId, vendorId: stockVendorId, status: "ACTIVE" } })
    ).id;
    const inv = () => prisma.inventory.findUniqueOrThrow({ where: { variantId_vendorId: { variantId: variant.id, vendorId: stockVendorId } } });
    const before = await inv();
    const free = before.quantity - before.reserved;
    expect(free).toBeGreaterThan(0);

    // more than is on hand → refused, nothing reserved, no order left behind
    const greedy = await newCustomer();
    await commerce.addToCart({ userId: greedy, platformSlug: PLATFORM, offerId, variantId: variant.id, qty: Math.min(free + 1, 99) });
    if (free + 1 <= 99) {
      await expect(
        commerce.placeOrder({ userId: greedy, platformSlug: PLATFORM, fulfilmentMethod: "PICKUP", payment: { method: "gateway", gateway: "mock" } }),
      ).rejects.toMatchObject({ code: "CONFLICT", details: { reason: "OUT_OF_STOCK" } });
      expect((await inv()).reserved).toBe(before.reserved);
      expect(await prisma.order.count({ where: { customerId: greedy } })).toBe(0);
    }

    // a normal order holds 1; a double-tap cancel releases it once
    const userId = await newCustomer();
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId, variantId: variant.id, qty: 1 });
    const order = await commerce.placeOrder({ userId, platformSlug: PLATFORM, fulfilmentMethod: "PICKUP", payment: { method: "gateway", gateway: "mock" } });
    expect((await inv()).reserved).toBe(before.reserved + 1);

    const results = await Promise.allSettled([commerce.cancelOrder(userId, order.id), commerce.cancelOrder(userId, order.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await inv()).reserved).toBe(before.reserved);
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(1);
  });
});
