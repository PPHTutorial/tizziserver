import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { comms, trust, wallet, commerce } from "@stall/core";
import { balanceOf, platformRevenue, userWallet } from "../src/wallet/ledger.ts";
import { dropUser, makeUser } from "./helpers.ts";

const PLATFORM = "grandprice";
const trashUsers: string[] = [];

async function newUser(role: "CUSTOMER" | "STAFF" = "CUSTOMER") {
  const u = await makeUser(role);
  trashUsers.push(u.id);
  return u.id;
}

afterAll(async () => {
  for (const id of trashUsers) {
    await prisma.order.deleteMany({ where: { customerId: id } }).catch(() => {});
    await prisma.dispute.deleteMany({ where: { openedById: id } }).catch(() => {});
    await prisma.conversationParticipant.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.report.deleteMany({ where: { reporterId: id } }).catch(() => {});
    const w = await prisma.wallet.findUnique({ where: { userId: id } });
    if (w) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { userId: id } }).catch(() => {});
    }
    await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: id } });
    await dropUser(id).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("chat", () => {
  it("dedupes a thread, delivers a message, tracks unread, and honours a block", async () => {
    const a = await newUser();
    const b = await newUser();

    const c1 = await comms.getOrCreateConversation({ kind: "CUSTOMER_VENDOR", participants: [{ userId: a, role: "CUSTOMER" }, { userId: b, role: "VENDOR" }] });
    const c2 = await comms.getOrCreateConversation({ kind: "CUSTOMER_VENDOR", participants: [{ userId: b, role: "VENDOR" }, { userId: a, role: "CUSTOMER" }] });
    expect(c2.id).toBe(c1.id); // same pair, same kind → reused

    await comms.sendMessage(a, c1.id, { body: "Hi, is this in stock?" });
    const listForB = await comms.listConversations(b);
    expect(listForB.items[0]?.unread).toBe(1);

    await comms.markConversationRead(b, c1.id);
    expect((await comms.listConversations(b)).items[0]?.unread).toBe(0);

    await comms.blockUser(b, a);
    await expect(comms.sendMessage(a, c1.id, { body: "hello?" })).rejects.toThrow();
    await comms.unblockUser(b, a);
    await expect(comms.sendMessage(a, c1.id, { body: "back on" })).resolves.toBeTruthy();
  });
});

describe("notifications", () => {
  it("respects per-category preferences and rolls unread", async () => {
    const u = await newUser();
    await comms.notify({ userId: u, category: "PROMO", title: "Deal!", body: "50% off" });
    let feed = await comms.listNotifications(u);
    expect(feed.unread).toBe(1);

    // turn PROMO fully off
    await comms.setNotificationPreference(u, "PROMO", { push: false, email: false, sms: false, inApp: false });
    await comms.notify({ userId: u, category: "PROMO", title: "Another deal", body: "more" });
    feed = await comms.listNotifications(u);
    expect(feed.unread).toBe(1); // unchanged — suppressed

    await comms.notify({ userId: u, category: "ORDER", title: "Shipped", body: "on its way" });
    feed = await comms.listNotifications(u);
    expect(feed.unread).toBe(2);

    await comms.markAllNotificationsRead(u);
    expect((await comms.listNotifications(u)).unread).toBe(0);
  });

  it("maps an OutboxEvent to a notification", async () => {
    const u = await newUser();
    const handled = await comms.notifyFromOutboxEvent({ type: "delivery.completed", aggregateType: "Delivery", aggregateId: "x", payload: { userId: u } });
    expect(handled).toBe(true);
    const feed = await comms.listNotifications(u);
    expect(feed.items.some((n) => n.category === "DELIVERY")).toBe(true);
  });
});

describe("disputes", () => {
  it("opens on a paid order, advances on evidence, resolves with a wallet refund", async () => {
    const customer = await newUser();
    await wallet.topUpWallet({ userId: customer, amountMinor: 500_000, platformSlug: PLATFORM, gateway: "mock" });
    const offer = await prisma.vendorOffer.findFirstOrThrow({ where: { product: { slug: "orbit-a54-phone" }, status: "ACTIVE" }, orderBy: { priceMinor: "asc" } });
    await commerce.addToCart({ userId: customer, platformSlug: PLATFORM, offerId: offer.id, qty: 1 });
    const order = await commerce.placeOrder({ userId: customer, platformSlug: PLATFORM, fulfilmentMethod: "PICKUP", payment: { method: "wallet" } });

    const opened = await trust.openDispute(customer, { kind: "ORDER", refId: order.id, category: "item-not-as-described", body: "The phone arrived scratched." });
    expect(opened.status).toBe("OPEN");
    expect(opened.slaDueAt).toBeTruthy();

    await trust.addDisputeEvidence(customer, opened.id, { kind: "IMAGE", fileKey: "ev/scratch.jpg" });
    const mid = await trust.getDispute(customer, opened.id);
    expect(mid.status).toBe("EVIDENCE");
    expect(mid.evidence.length).toBeGreaterThanOrEqual(2);

    const staff = await newUser("STAFF");
    const revenueBefore = await balanceOf(platformRevenue(PLATFORM));
    const walletBefore = await balanceOf(userWallet(customer));
    const res = await trust.resolveDispute(staff, opened.id, { outcome: "Partial refund issued", refundMinor: 5_000 });
    expect(res.status).toBe("RESOLVED");
    expect((await balanceOf(userWallet(customer))) - walletBefore).toBe(5_000);
    expect(revenueBefore - (await balanceOf(platformRevenue(PLATFORM)))).toBe(5_000);

    const appeal = await trust.appealDispute(customer, opened.id, "I want a full refund.");
    expect(appeal.status).toBe("APPEALED");
    const decided = await trust.decideAppeal(staff, opened.id, "DENIED", "Original resolution stands.");
    expect(decided.status).toBe("DENIED");
  });

  it("rejects a dispute from a non-party", async () => {
    const owner = await newUser();
    await wallet.topUpWallet({ userId: owner, amountMinor: 300_000, platformSlug: PLATFORM, gateway: "mock" });
    const offer = await prisma.vendorOffer.findFirstOrThrow({ where: { product: { slug: "orbit-a54-phone" }, status: "ACTIVE" }, orderBy: { priceMinor: "asc" } });
    await commerce.addToCart({ userId: owner, platformSlug: PLATFORM, offerId: offer.id, qty: 1 });
    const order = await commerce.placeOrder({ userId: owner, platformSlug: PLATFORM, fulfilmentMethod: "PICKUP", payment: { method: "wallet" } });
    const stranger = await newUser();
    await expect(trust.openDispute(stranger, { kind: "ORDER", refId: order.id, category: "x", body: "not mine" })).rejects.toThrow();
  });
});

describe("support + unified KYC review", () => {
  it("a support ticket opens a chat with the first message in it", async () => {
    const u = await newUser();
    const t = await trust.createSupportTicket(u, { category: "Wallet", subject: "Withdrawal stuck", body: "It's been 2 days." });
    expect(t.number).toMatch(/^SUP-/);
    const msgs = await comms.getMessages(u, t.conversationId, {});
    expect(msgs.items.some((m) => m.body?.includes("Withdrawal stuck"))).toBe(true);
  });

  it("reviewKycCase approves a courier and flips their profile + role", async () => {
    // spin up a fresh courier onboarding
    const cu = await newUser();
    const { couriers } = await import("@stall/core");
    await couriers.startCourierOnboarding({ userId: cu, platformSlug: PLATFORM });
    const kyc = await prisma.kycCase.findFirstOrThrow({ where: { subjectType: "COURIER" }, orderBy: { submittedAt: "desc" } });
    const courierId = kyc.subjectId;

    const staff = await newUser("STAFF");
    const r = await trust.reviewKycCase(staff, kyc.id, "APPROVE", "looks good");
    expect(r.status).toBe("APPROVED");
    const cp = await prisma.courierProfile.findUniqueOrThrow({ where: { id: courierId } });
    expect(cp.status).toBe("ACTIVE");
    const role = await prisma.userRole.findUniqueOrThrow({ where: { userId_role: { userId: cu, role: "COURIER" } } });
    expect(role.kycStatus).toBe("APPROVED");

    // cleanup the courier profile (not covered by dropUser)
    await prisma.courierProfile.deleteMany({ where: { userId: cu } }).catch(() => {});
    await prisma.kycCase.deleteMany({ where: { id: kyc.id } }).catch(() => {});
  });
});
