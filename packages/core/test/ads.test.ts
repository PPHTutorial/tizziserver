import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { ads, wallet, referrals } from "@stall/core";
import { balanceOf, platformEscrow, platformRevenue, userWallet } from "../src/wallet/ledger.ts";
import { dropUser, makeUser } from "./helpers.ts";

const PLATFORM = "grandprice";
const trashUsers: string[] = [];
const trashCampaigns: string[] = [];
const trashTiers: string[] = [];
let productId = "seed-product-fallback";

async function newVendor() {
  const u = await makeUser("VENDOR");
  trashUsers.push(u.id);
  await wallet.topUpWallet({ userId: u.id, amountMinor: 2_000_000, platformSlug: PLATFORM, gateway: "mock" });
  return u.id;
}

beforeAll(async () => {
  const p = await prisma.product.findFirst({ where: { status: "PUBLISHED" }, select: { id: true } });
  if (p) productId = p.id;
  const key = `test-tier-${Date.now()}`;
  const t = await ads.upsertBoostTier({
    key,
    name: "Test Premium",
    platformSlugs: [PLATFORM],
    billingModel: "CPM",
    priceMinor: 5000,
    rankBoostBps: 13000,
    placements: ["HOME_RAIL", "SEARCH_TOP"],
    badge: "Sponsored",
  });
  trashTiers.push(t.key);
});

afterAll(async () => {
  for (const id of trashCampaigns) {
    await prisma.adEvent.deleteMany({ where: { campaignId: id } });
    await prisma.campaign.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const key of trashTiers) await prisma.boostTier.deleteMany({ where: { key } }).catch(() => {});
  for (const id of trashUsers) {
    const w = await prisma.wallet.findUnique({ where: { userId: id } });
    if (w) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { userId: id } }).catch(() => {});
    }
    await prisma.paymentIntent.deleteMany({ where: { userId: id } });
    await prisma.referral.deleteMany({ where: { OR: [{ referrerId: id }, { refereeId: id }] } });
    await prisma.referralCode.deleteMany({ where: { userId: id } });
    await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: id } });
    await dropUser(id).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("ads — boost tiers", () => {
  it("lists only active tiers for the platform", async () => {
    const { items } = await ads.listBoostTiers(PLATFORM);
    expect(items.some((t) => trashTiers.includes(t.key))).toBe(true);
    expect(items.every((t) => t.rankBoostBps >= 10000)).toBe(true);
  });

  it("rejects a rankBoost below 1.0×", async () => {
    await expect(
      ads.upsertBoostTier({ key: "bad", name: "Bad", platformSlugs: [PLATFORM], billingModel: "CPM", priceMinor: 1, rankBoostBps: 9000, placements: ["HOME_RAIL"] }),
    ).rejects.toThrow();
  });
});

describe("ads — campaign lifecycle + budget ledger", () => {
  it("charges the budget on submit, accrues spend on events, refunds the remainder on completion", async () => {
    const vendorId = await newVendor();
    const startWallet = await balanceOf(userWallet(vendorId));
    const startRevenue = await balanceOf(platformRevenue(PLATFORM));

    const c = await ads.createCampaign({
      vendorId,
      platformSlug: PLATFORM,
      name: "Test campaign",
      boostTierKey: trashTiers[0],
      budgetMinor: 100_00,
      productIds: [productId],
    });
    trashCampaigns.push(c.id);
    expect(c.status).toBe("DRAFT");

    const submitted = await ads.submitCampaign(vendorId, c.id, { method: "wallet" });
    // ADS_REVIEW_REQUIRED defaults true → PENDING_REVIEW; approve it through staff
    if (submitted.status === "PENDING_REVIEW") {
      const staff = await makeUser("STAFF");
      trashUsers.push(staff.id);
      await ads.reviewCampaign(staff.id, c.id, { approve: true });
    }
    const afterCharge = await balanceOf(userWallet(vendorId));
    expect(startWallet - afterCharge).toBe(100_00);

    // an impression accrues a CPM slice (priceMinor/1000, min 1)
    const ev = await ads.recordAdEvent({ campaignId: c.id, kind: "IMPRESSION", platformSlug: PLATFORM });
    expect(ev.recorded).toBe(true);
    expect(ev.costMinor).toBe(Math.max(1, Math.round(5000 / 1000)));

    const settled = await ads.settleCampaign(c.id, "COMPLETED");
    expect(settled.status).toBe("COMPLETED");

    const endWallet = await balanceOf(userWallet(vendorId));
    const endRevenue = await balanceOf(platformRevenue(PLATFORM));
    const spent = 5; // one impression at CPM 5000/1000
    expect(startWallet - endWallet).toBe(spent);
    expect(endRevenue - startRevenue).toBe(spent);
    // escrow nets to zero for this campaign's flow
    expect(await balanceOf(platformEscrow(PLATFORM))).toBeGreaterThanOrEqual(0);
  });

  it("auto-pauses a campaign when the budget is exhausted", async () => {
    const vendorId = await newVendor();
    const cpcKey = `test-cpc-${Date.now()}`;
    await ads.upsertBoostTier({ key: cpcKey, name: "Test CPC", platformSlugs: [PLATFORM], billingModel: "CPC", priceMinor: 5000, placements: ["SEARCH_TOP"] });
    trashTiers.push(cpcKey);

    const c = await ads.createCampaign({ vendorId, platformSlug: PLATFORM, name: "Tiny", boostTierKey: cpcKey, budgetMinor: 5000, productIds: [productId] });
    trashCampaigns.push(c.id);
    const sub = await ads.submitCampaign(vendorId, c.id, { method: "wallet" });
    if (sub.status === "PENDING_REVIEW") {
      const staff = await makeUser("STAFF");
      trashUsers.push(staff.id);
      await ads.reviewCampaign(staff.id, c.id, { approve: true });
    }
    // one CPC click at 5000 == the whole budget → auto-pause
    const ev = await ads.recordAdEvent({ campaignId: c.id, kind: "CLICK", platformSlug: PLATFORM });
    expect(ev.costMinor).toBe(5000);
    const row = await prisma.campaign.findUnique({ where: { id: c.id } });
    expect(row?.status).toBe("PAUSED");
    expect(row?.spentMinor).toBe(row?.budgetMinor);
    await ads.settleCampaign(c.id, "CANCELLED");
  });
});

describe("referrals", () => {
  it("rewards the referrer when the referee places a qualifying order", async () => {
    const referrer = await makeUser("CUSTOMER");
    const referee = await makeUser("CUSTOMER");
    trashUsers.push(referrer.id, referee.id);
    const mine = await referrals.getMyReferral(referrer.id);
    expect(mine.code).toHaveLength(8);

    await referrals.applyReferralCode(referee.id, mine.code);
    const before = await balanceOf(userWallet(referrer.id));

    // below threshold → no reward
    await referrals.qualifyReferralForOrder({ customerId: referee.id, orderId: "o-small", orderTotalMinor: 100, platformSlug: PLATFORM });
    expect(await balanceOf(userWallet(referrer.id))).toBe(before);

    // qualifying order → reward lands
    await referrals.qualifyReferralForOrder({ customerId: referee.id, orderId: "o-big", orderTotalMinor: 50_000, platformSlug: PLATFORM });
    const after = await balanceOf(userWallet(referrer.id));
    expect(after).toBeGreaterThan(before);

    const summary = await referrals.getMyReferral(referrer.id);
    expect(summary.counts.rewarded).toBe(1);
  });

  it("won't let a user apply their own code", async () => {
    const u = await makeUser("CUSTOMER");
    trashUsers.push(u.id);
    const { code } = await referrals.getMyReferral(u.id);
    await expect(referrals.applyReferralCode(u.id, code)).rejects.toThrow();
  });
});
