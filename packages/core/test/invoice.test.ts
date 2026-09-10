import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { commerce, wallet } from "@stall/core";
import { dropUser, makeUser } from "./helpers.ts";

const PLATFORM = "grandprice";
const trash: string[] = [];

let offerA = "";

async function cleanupUser(userId: string) {
  await prisma.couponRedemption.deleteMany({ where: { userId } });
  await prisma.order.deleteMany({ where: { customerId: userId } }); // cascades vendorOrders/items/events/refunds/invoice
  await prisma.cart.deleteMany({ where: { userId } });
  await prisma.paymentIntent.deleteMany({ where: { userId } });
  const w = await prisma.wallet.findUnique({ where: { userId } });
  if (w) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
    await prisma.wallet.delete({ where: { userId } }).catch(() => {});
  }
  await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: userId } });
  await dropUser(userId);
}

async function newCustomer() {
  const u = await makeUser("CUSTOMER");
  trash.push(u.id);
  return u.id;
}

async function fulfilledOrder(userId: string) {
  await wallet.initiateTopUp({ userId, amountMinor: 1_000_000, platformSlug: PLATFORM });
  await commerce.addToCart({ userId, platformSlug: PLATFORM, offerId: offerA, qty: 1 });
  const order = await commerce.placeOrder({
    userId,
    platformSlug: PLATFORM,
    fulfilmentMethod: "PICKUP",
    payment: { method: "wallet" },
  });
  const vo = order.vendorOrders[0]!;
  const vendorUser = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: vo.vendorId }, select: { userId: true } });
  await commerce.completeVendorOrder(vendorUser.userId, vo.id);
  return order;
}

beforeAll(async () => {
  const offers = await prisma.vendorOffer.findMany({
    where: { product: { slug: "orbit-a54-phone" }, status: "ACTIVE" },
    orderBy: { priceMinor: "asc" },
  });
  expect(offers.length).toBeGreaterThanOrEqual(1);
  offerA = offers[0]!.id;
});

afterAll(async () => {
  for (const id of trash) await cleanupUser(id).catch(() => {});
  await prisma.$disconnect();
});

describe("invoice PDF", () => {
  it("is rendered and stored (STORAGE_PROVIDER=mock) when the order becomes FULFILLED", async () => {
    const userId = await newCustomer();
    const order = await fulfilledOrder(userId);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(invoice.pdfKey).toBe(`invoices/${invoice.number}.pdf`);

    const { buffer, filename } = await commerce.getInvoicePdf(userId, order.id);
    expect(filename).toBe(`${invoice.number}.pdf`);
    // a real PDF, not just whatever bytes happened to be on disk
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("rejects a non-owner, and lazily regenerates a missing pdfKey on download", async () => {
    const userId = await newCustomer();
    const otherUserId = await newCustomer();
    const order = await fulfilledOrder(userId);

    await expect(commerce.getInvoicePdf(otherUserId, order.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // simulate the best-effort generation on completion having failed
    await prisma.invoice.update({ where: { orderId: order.id }, data: { pdfKey: null } });
    const { buffer } = await commerce.getInvoicePdf(userId, order.id);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const after = await prisma.invoice.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(after.pdfKey).not.toBeNull();
  });
});
