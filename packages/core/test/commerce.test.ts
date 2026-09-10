import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { commerce, wallet } from "@stall/core";
import { setPin } from "../src/auth/credentials.ts";
import { balanceOf, gatewayClearing, platformEscrow, platformRevenue, vendorPayable } from "../src/wallet/ledger.ts";
import { dropUser, makeUser } from "./helpers.ts";

const PLATFORM = "grandprice";
const trash: string[] = [];

// Two seeded grandprice offers for the same product → multi-vendor cart.
let offerA = ""; // 184900 — Kumasi Gadget Store
let offerB = ""; // 189900 — Accra Electronics Hub

async function cleanupUser(userId: string) {
  await prisma.couponRedemption.deleteMany({ where: { userId } });
  await prisma.order.deleteMany({ where: { customerId: userId } }); // cascades vendorOrders/items/events/refunds/invoice
  await prisma.cart.deleteMany({ where: { userId } });
  await prisma.paymentIntent.deleteMany({ where: { userId } });
  await prisma.payout.deleteMany({ where: { ownerType: "USER", ownerId: userId } });
  const w = await prisma.wallet.findUnique({ where: { userId } });
  if (w) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
    await prisma.wallet.delete({ where: { userId } }).catch(() => {});
  }
  await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: userId } }); // cascades entries
  await dropUser(userId);
}

async function newCustomer() {
  const u = await makeUser("CUSTOMER");
  trash.push(u.id);
  return u.id;
}

beforeAll(async () => {
  const offers = await prisma.vendorOffer.findMany({
    where: { product: { slug: "orbit-a54-phone" }, status: "ACTIVE" },
    orderBy: { priceMinor: "asc" },
  });
  expect(offers.length).toBeGreaterThanOrEqual(2);
  offerA = offers[0]!.id;
  offerB = offers[1]!.id;
});

afterAll(async () => {
  for (const id of trash) await cleanupUser(id).catch(() => {});
  await prisma.$disconnect();
});

describe("cart + checkout quote", () => {
  it("groups by vendor, snapshots price, and quotes fee lines", async () => {
    const userId = await newCustomer();
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerA, qty: 1 });
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerB, qty: 2 });

    const cart = await commerce.getCart({ userId, platformSlug: PLATFORM });
    expect(cart.groups).toHaveLength(2);
    expect(cart.itemCount).toBe(3);
    expect(cart.subtotalMinor).toBe(184900 + 189900 * 2);

    const quote = await commerce.quoteCheckout({ userId, platformSlug: PLATFORM, fulfilmentMethod: "PICKUP" });
    expect(quote.itemsSubtotalMinor).toBe(cart.subtotalMinor);
    expect(quote.deliveryFeeMinor).toBe(0); // PICKUP
    expect(quote.serviceFeeMinor).toBe(Math.round(cart.subtotalMinor * 0.02));
    expect(quote.totalMinor).toBe(quote.itemsSubtotalMinor + quote.serviceFeeMinor + quote.taxMinor);
  });

  it("applies a percentage coupon", async () => {
    const userId = await newCustomer();
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerA, qty: 1 });
    const applied = await commerce.applyCoupon({ userId, platformSlug: PLATFORM, code: "welcome10" });
    expect(applied.couponValid).toBe(true);
    expect(applied.couponDiscountMinor).toBe(Math.round(184900 * 0.1));

    const quote = await commerce.quoteCheckout({ userId, platformSlug: PLATFORM, fulfilmentMethod: "PICKUP" });
    expect(quote.discountMinor).toBe(Math.round(184900 * 0.1));
    expect(quote.totalMinor).toBeLessThan(184900);
  });
});

describe("paid multi-vendor order (wallet) → escrow → release", () => {
  it("captures to escrow, then releases payout + commission on completion", async () => {
    const userId = await newCustomer();

    // fund the wallet
    const top = await wallet.initiateTopUp({ userId, amountMinor: 1_000_000, platformSlug: PLATFORM });
    expect(top.status).toBe("SUCCEEDED");

    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerA, qty: 1 });
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerB, qty: 1 });

    const escrowBefore = await balanceOf(platformEscrow(PLATFORM));
    const revenueBefore = await balanceOf(platformRevenue(PLATFORM));
    const walletBefore = await wallet.walletBalanceMinor(userId);

    const order = await commerce.placeOrder({
      userId,
      platformSlug: PLATFORM,
      fulfilmentMethod: "PICKUP",
      payment: { method: "wallet" },
    });
    expect(order.status).toBe("PLACED");
    expect(order.vendorOrders).toHaveLength(2);
    expect(order.totalMinor).toBe(order.itemsSubtotalMinor + order.serviceFeeMinor + order.taxMinor);

    // money moved wallet → escrow
    expect(await wallet.walletBalanceMinor(userId)).toBe(walletBefore - order.totalMinor);
    expect(await balanceOf(platformEscrow(PLATFORM))).toBe(escrowBefore + order.totalMinor);

    // complete each vendor sub-order
    for (const vo of order.vendorOrders) {
      const vendorUser = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: vo.vendorId }, select: { userId: true } });
      const payableBefore = await balanceOf({ ownerType: "VENDOR", ownerId: vo.vendorId, kind: "PAYABLE" });
      await commerce.completeVendorOrder(vendorUser.userId, vo.id);
      const payableAfter = await balanceOf({ ownerType: "VENDOR", ownerId: vo.vendorId, kind: "PAYABLE" });
      expect(payableAfter - payableBefore).toBe(vo.payoutMinor);
    }

    const done = await commerce.getOrder(userId, order.id);
    expect(done.status).toBe("FULFILLED");
    expect(done.vendorOrders.every((v) => v.status === "COMPLETED")).toBe(true);

    // escrow for this order fully drained; platform revenue = Σ commission + order fees
    expect(await balanceOf(platformEscrow(PLATFORM))).toBe(escrowBefore);
    const commissionTotal = order.vendorOrders.reduce((s, v) => s + v.commissionMinor, 0);
    const feeTotal = order.deliveryFeeMinor + order.serviceFeeMinor + order.taxMinor;
    expect(await balanceOf(platformRevenue(PLATFORM))).toBe(revenueBefore + commissionTotal + feeTotal);
  });
});

describe("gateway payment + cancel/refund", () => {
  it("captures via the mock gateway, then a cancel refunds the original card — not the wallet", async () => {
    const userId = await newCustomer();
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerB, qty: 1 });

    const escrowBefore = await balanceOf(platformEscrow(PLATFORM));
    const clearingBefore = await balanceOf(gatewayClearing(PLATFORM));

    const order = await commerce.placeOrder({
      userId,
      platformSlug: PLATFORM,
      fulfilmentMethod: "PICKUP",
      payment: { method: "gateway", gateway: "mock" },
    });
    expect(order.status).toBe("PLACED");
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    expect(intent.status).toBe("SUCCEEDED");

    const cancelled = await commerce.cancelOrder(userId, order.id);
    expect(cancelled.status).toBe("REFUNDED");
    expect(cancelled.refunds[0]?.status).toBe("DONE");
    // refunded back through the gateway (mock), not credited to the wallet
    expect(await wallet.walletBalanceMinor(userId)).toBe(0);
    expect(await balanceOf(platformEscrow(PLATFORM))).toBe(escrowBefore);
    expect(await balanceOf(gatewayClearing(PLATFORM))).toBe(clearingBefore);
  });
});

describe("returns", () => {
  it("approving a return refunds the wallet and charges back the vendor", async () => {
    const userId = await newCustomer();
    await wallet.initiateTopUp({ userId, amountMinor: 1_000_000, platformSlug: PLATFORM });
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerA, qty: 2 });

    const order = await commerce.placeOrder({
      userId,
      platformSlug: PLATFORM,
      fulfilmentMethod: "PICKUP",
      payment: { method: "wallet" },
    });
    const vo = order.vendorOrders[0]!;
    const item = vo.items[0]!;
    const vendorUser = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: vo.vendorId }, select: { userId: true } });
    await commerce.completeVendorOrder(vendorUser.userId, vo.id);

    const payableBefore = await balanceOf(vendorPayable(vo.vendorId));
    const walletBefore = await wallet.walletBalanceMinor(userId);

    // return 1 of the 2 units bought
    const req = await commerce.requestReturn(userId, vo.id, { reason: "wrong size", items: [{ orderItemId: item.id, qty: 1 }] });
    expect(req.status).toBe("REQUESTED");
    expect(req.amountMinor).toBe(item.unitPriceMinor);

    const queue = await commerce.listVendorReturns(vendorUser.userId);
    expect(queue.find((r) => r.id === req.id)?.status).toBe("REQUESTED");

    const reviewed = await commerce.reviewReturn(vendorUser.userId, req.id, "APPROVED");
    expect(reviewed.status).toBe("APPROVED");
    expect(reviewed.refund?.method).toBe("wallet");
    expect(reviewed.refund?.amountMinor).toBe(item.unitPriceMinor);

    // the vendor is charged back; the customer is refunded to their wallet
    expect(await wallet.walletBalanceMinor(userId)).toBe(walletBefore + item.unitPriceMinor);
    expect(await balanceOf(vendorPayable(vo.vendorId))).toBe(payableBefore - item.unitPriceMinor);

    // only 1 of the 2 units is left to return
    await expect(
      commerce.requestReturn(userId, vo.id, { reason: "more", items: [{ orderItemId: item.id, qty: 2 }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejecting a return makes no financial change, and doesn't consume the returnable quantity", async () => {
    const userId = await newCustomer();
    await wallet.initiateTopUp({ userId, amountMinor: 1_000_000, platformSlug: PLATFORM });
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerB, qty: 1 });

    const order = await commerce.placeOrder({
      userId,
      platformSlug: PLATFORM,
      fulfilmentMethod: "PICKUP",
      payment: { method: "wallet" },
    });
    const vo = order.vendorOrders[0]!;
    const item = vo.items[0]!;
    const vendorUser = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: vo.vendorId }, select: { userId: true } });
    await commerce.completeVendorOrder(vendorUser.userId, vo.id);

    const payableBefore = await balanceOf(vendorPayable(vo.vendorId));
    const walletBefore = await wallet.walletBalanceMinor(userId);

    const req = await commerce.requestReturn(userId, vo.id, { reason: "changed mind", items: [{ orderItemId: item.id, qty: 1 }] });
    const reviewed = await commerce.reviewReturn(vendorUser.userId, req.id, "REJECTED", "not eligible");
    expect(reviewed.status).toBe("REJECTED");

    expect(await wallet.walletBalanceMinor(userId)).toBe(walletBefore);
    expect(await balanceOf(vendorPayable(vo.vendorId))).toBe(payableBefore);

    const again = await commerce.requestReturn(userId, vo.id, { reason: "retry", items: [{ orderItemId: item.id, qty: 1 }] });
    expect(again.status).toBe("REQUESTED");
  });

  it("two concurrent return requests for the same item can't both succeed, and a vendor can't double-approve overlapping returns", async () => {
    const userId = await newCustomer();
    await wallet.initiateTopUp({ userId, amountMinor: 1_000_000, platformSlug: PLATFORM });
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerA, qty: 1 });

    const order = await commerce.placeOrder({
      userId,
      platformSlug: PLATFORM,
      fulfilmentMethod: "PICKUP",
      payment: { method: "wallet" },
    });
    const vo = order.vendorOrders[0]!;
    const item = vo.items[0]!;
    const vendorUser = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: vo.vendorId }, select: { userId: true } });
    await commerce.completeVendorOrder(vendorUser.userId, vo.id);

    // Both requests race against the same "0 of 1 already returned" state —
    // only one may create a Return row for the full quantity.
    const requested = await Promise.allSettled([
      commerce.requestReturn(userId, vo.id, { reason: "race-a", items: [{ orderItemId: item.id, qty: 1 }] }),
      commerce.requestReturn(userId, vo.id, { reason: "race-b", items: [{ orderItemId: item.id, qty: 1 }] }),
    ]);
    const created = requested.filter((o) => o.status === "fulfilled");
    expect(created).toHaveLength(1);

    // Even if a second overlapping return had slipped through some other way
    // (e.g. two different items on the same order graph), reviewReturn's own
    // aggregate check must reject an approval that would over-refund.
    const first = created[0]!;
    const ret = first.status === "fulfilled" ? first.value : null;
    expect(ret).not.toBeNull();
    const phantom = await prisma.return.create({
      data: { vendorOrderId: vo.id, reason: "phantom-overlap", items: [{ orderItemId: item.id, qty: 1 }], status: "REQUESTED" },
    });
    await expect(commerce.reviewReturn(vendorUser.userId, phantom.id, "APPROVED")).rejects.toMatchObject({ code: "CONFLICT" });
    await prisma.return.delete({ where: { id: phantom.id } });
  });
});

describe("stale PENDING_PAYMENT sweep", () => {
  it("drops a stale order with no captured payment", async () => {
    const userId = await newCustomer();
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerA, qty: 1 });
    const cart = await commerce.getCart({ userId, platformSlug: PLATFORM });

    // Simulate the crash window in placeOrder: the order graph exists, but
    // the payment step never ran (and never had the chance to compensate).
    const order = await prisma.order.create({
      data: {
        number: `ST-STALE-${userId.slice(-8)}`,
        customerId: userId,
        platformSlug: PLATFORM,
        status: "PENDING_PAYMENT",
        currency: "GHS",
        itemsSubtotalMinor: cart.subtotalMinor,
        totalMinor: cart.subtotalMinor,
        paymentMethod: "wallet",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });

    const { released } = await commerce.releaseStaleReservations(60 * 60 * 1000);
    expect(released).toBeGreaterThanOrEqual(1);
    expect(await prisma.order.findUnique({ where: { id: order.id } })).toBeNull();
  });

  it("refunds a stale order that already captured payment via the gateway", async () => {
    const userId = await newCustomer();
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerB, qty: 1 });

    const escrowBefore = await balanceOf(platformEscrow(PLATFORM));
    const clearingBefore = await balanceOf(gatewayClearing(PLATFORM));

    const order = await commerce.placeOrder({
      userId,
      platformSlug: PLATFORM,
      fulfilmentMethod: "PICKUP",
      payment: { method: "gateway", gateway: "mock" },
    });
    expect(order.status).toBe("PLACED");

    // Simulate the crash: capture committed (ledger + intent already updated
    // atomically), but the process died before the PLACED transition.
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "PENDING_PAYMENT", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const { released } = await commerce.releaseStaleReservations(60 * 60 * 1000);
    expect(released).toBeGreaterThanOrEqual(1);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("REFUNDED");
    // refunded through the gateway (mock), not credited to the wallet
    expect(await wallet.walletBalanceMinor(userId)).toBe(0);
    expect(await balanceOf(platformEscrow(PLATFORM))).toBe(escrowBefore);
    expect(await balanceOf(gatewayClearing(PLATFORM))).toBe(clearingBefore);
  });
});

describe("payment failure path", () => {
  it("a declined capture leaves no wallet credit (topup)", async () => {
    const userId = await newCustomer();
    const res = await wallet.initiateTopUp({ userId, amountMinor: 5013, platformSlug: PLATFORM }); // % 100 === 13 → mock declines
    expect(res.status).toBe("FAILED");
    expect(await wallet.walletBalanceMinor(userId)).toBe(0);
  });
});

describe("wallet withdrawal — PIN gated", () => {
  it("rejects a bad PIN and honours the right one", async () => {
    const userId = await newCustomer();
    await wallet.initiateTopUp({ userId, amountMinor: 50_000, platformSlug: PLATFORM });
    await setPin(userId, "1357");

    await expect(
      wallet.requestWithdrawal({ userId, amountMinor: 20_000, pin: "0000", platformSlug: PLATFORM }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const ok = await wallet.requestWithdrawal({ userId, amountMinor: 20_000, pin: "1357", platformSlug: PLATFORM });
    expect(ok.balanceMinor).toBe(30_000);
    const payout = await prisma.payout.findFirstOrThrow({ where: { id: ok.payoutId } });
    expect(payout.status).toBe("PENDING");
  });

  it("rejects a withdrawal above the balance", async () => {
    const userId = await newCustomer();
    await wallet.initiateTopUp({ userId, amountMinor: 10_000, platformSlug: PLATFORM });
    await setPin(userId, "2468");
    await expect(
      wallet.requestWithdrawal({ userId, amountMinor: 25_000, pin: "2468", platformSlug: PLATFORM }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });
});

describe("vendor payout — PIN gated", () => {
  // offerA/offerB's vendors are seeded fixtures shared across every test run
  // against this dev DB, so their PAYABLE balance already carries whatever
  // prior runs accrued and never withdrew — assert on deltas, not absolutes.
  async function completedVendorOrder(offerId: string) {
    const userId = await newCustomer();
    await wallet.initiateTopUp({ userId, amountMinor: 1_000_000, platformSlug: PLATFORM });
    await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId, qty: 1 });
    const order = await commerce.placeOrder({
      userId,
      platformSlug: PLATFORM,
      fulfilmentMethod: "PICKUP",
      payment: { method: "wallet" },
    });
    const vo = order.vendorOrders[0]!;
    const vendorUser = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: vo.vendorId }, select: { userId: true } });
    await commerce.completeVendorOrder(vendorUser.userId, vo.id);
    return { vendorUserId: vendorUser.userId, vendorId: vo.vendorId, payoutMinor: vo.payoutMinor };
  }

  it("withdraws from the accrued payable balance and honours the PIN", async () => {
    const { vendorUserId, vendorId, payoutMinor } = await completedVendorOrder(offerA);
    const balBefore = await commerce.vendorBalanceMinor(vendorId);

    await setPin(vendorUserId, "9876");
    await expect(
      commerce.requestVendorPayout({ userId: vendorUserId, platformSlug: PLATFORM, amountMinor: payoutMinor, pin: "0000" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const res = await commerce.requestVendorPayout({ userId: vendorUserId, platformSlug: PLATFORM, amountMinor: payoutMinor, pin: "9876" });
    expect(res.balanceMinor).toBe(balBefore - payoutMinor);
    expect(await commerce.vendorBalanceMinor(vendorId)).toBe(balBefore - payoutMinor);

    const payout = await prisma.payout.findFirstOrThrow({ where: { id: res.payoutId } });
    expect(payout.status).toBe("PENDING");
    expect(payout.ownerType).toBe("VENDOR");
    expect((await commerce.listVendorPayouts(vendorUserId)).some((p) => p.id === res.payoutId)).toBe(true);
  });

  it("rejects a withdrawal above the balance, and a concurrent double-withdrawal can't both succeed", async () => {
    const { vendorUserId, vendorId } = await completedVendorOrder(offerB);
    await setPin(vendorUserId, "1122");
    const bal = await commerce.vendorBalanceMinor(vendorId);

    await expect(
      commerce.requestVendorPayout({ userId: vendorUserId, platformSlug: PLATFORM, amountMinor: bal + 100, pin: "1122" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    // Two concurrent full-balance withdrawals both pass the app-level
    // pre-check (a non-atomic snapshot read) — only one may actually debit,
    // guarded atomically by `guardNonNegative` inside postTxn.
    const outcomes = await Promise.allSettled([
      commerce.requestVendorPayout({ userId: vendorUserId, platformSlug: PLATFORM, amountMinor: bal, pin: "1122" }),
      commerce.requestVendorPayout({ userId: vendorUserId, platformSlug: PLATFORM, amountMinor: bal, pin: "1122" }),
    ]);
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(await commerce.vendorBalanceMinor(vendorId)).toBe(0);
  });
});
