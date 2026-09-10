import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@stall/db";
import { auctions, wallet } from "@stall/core";
import { auctionEscrow, balanceOf, platformRevenue, userWallet } from "../src/wallet/ledger.ts";
import { sha256Hex } from "../src/crypto.ts";
import { dropUser, makeUser } from "./helpers.ts";

const PLATFORM = "grandprice";
const trashUsers: string[] = [];
const trashAuctions: string[] = [];

async function newUser() {
  const u = await makeUser("CUSTOMER");
  trashUsers.push(u.id);
  await wallet.topUpWallet({ userId: u.id, amountMinor: 5_000_000, platformSlug: PLATFORM, gateway: "mock" });
  return u.id;
}

async function openAuction(over: Partial<Parameters<typeof auctions.createAuction>[0]> = {}) {
  const { id, slug } = await auctions.createAuction({
    title: `Test Draw ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    retailValueMinor: 1_000_000,
    ticketPriceMinor: 10_000,
    winTargetMinor: 200_000,
    seatsTotal: 100,
    minSeatsToDraw: 3,
    drawTrigger: "EITHER",
    nonWinnerPolicy: "REFUND",
    asset: { title: "Test Prize" },
    ...over,
  });
  trashAuctions.push(id);
  await auctions.setAuctionStatus(id, "ANNOUNCED");
  await auctions.setAuctionStatus(id, "OPEN");
  return { id, slug };
}

afterAll(async () => {
  for (const id of trashAuctions) {
    await prisma.auction.deleteMany({ where: { id } }).catch(() => {});
    await prisma.ledgerAccount.deleteMany({ where: { ownerType: "ESCROW", ownerId: `auction:${id}` } }).catch(() => {});
  }
  for (const id of trashUsers) {
    const w = await prisma.wallet.findUnique({ where: { userId: id } });
    if (w) {
      await prisma.walletTransaction.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { userId: id } }).catch(() => {});
    }
    await prisma.paymentIntent.deleteMany({ where: { userId: id } });
    await prisma.ledgerAccount.deleteMany({ where: { ownerType: "USER", ownerId: id } });
    await dropUser(id).catch(() => {});
  }
  await prisma.$disconnect();
});

describe("auction authoring + tickets", () => {
  it("rejects winTarget >= retail", async () => {
    await expect(
      auctions.createAuction({ title: "Bad", retailValueMinor: 100, ticketPriceMinor: 10, winTargetMinor: 100, seatsTotal: 10, asset: { title: "x" } }),
    ).rejects.toThrow();
  });

  it("buys seats: mints tickets, rolls wallet + participant, credits escrow, records a TICKETS event", async () => {
    const { id, slug } = await openAuction();
    const userId = await newUser();

    const escrowBefore = await balanceOf(auctionEscrow(id));
    const res = await auctions.buyTickets({ userId, auctionId: id, count: 4, payment: { method: "wallet" } });
    expect(res.ticketsMinted).toBe(4);
    expect(res.amountMinor).toBe(40_000);
    expect(res.walletCount).toBe(4);
    expect(res.qualificationScore).toBeGreaterThan(0);

    expect((await balanceOf(auctionEscrow(id))) - escrowBefore).toBe(40_000);

    const tickets = await prisma.auctionTicket.count({ where: { auctionId: id, userId } });
    expect(tickets).toBe(4);
    const p = await prisma.auctionParticipant.findFirstOrThrow({ where: { auctionId: id, userId } });
    expect(p.ticketCount).toBe(4);
    const ev = await prisma.qualificationEvent.count({ where: { participantId: p.id, factor: "TICKETS" } });
    expect(ev).toBe(1);

    const detail = await auctions.getAuction(slug, userId);
    expect(detail.seatsSold).toBe(4);
    expect(detail.mine?.ticketCount).toBe(4);
  });

  it("qualification signals de-dupe by key and re-weight the score", async () => {
    const { id, slug } = await openAuction();
    const userId = await newUser();
    await auctions.buyTickets({ userId, auctionId: id, count: 2, payment: { method: "wallet" } });
    const base = (await auctions.getQualification(userId, slug)).qualificationScore;

    const a = await auctions.recordQualification(userId, slug, "SHARE", { key: "fb-1", points: 5 });
    expect(a.recorded).toBe(true);
    const b = await auctions.recordQualification(userId, slug, "SHARE", { key: "fb-1", points: 5 });
    expect(b.recorded).toBe(false); // same key
    expect(a.qualificationScore).toBeGreaterThan(base);

    const q = await auctions.getQualification(userId, slug);
    const share = q.breakdown.find((x) => x.factor === "SHARE")!;
    expect(share.points).toBe(5);
    expect(share.contribution).toBeCloseTo(share.weight * 5, 3);
  });
});

describe("commit-reveal draw", () => {
  it("picks exactly one winner from weighted windows, refunds non-winners, reconciles escrow", async () => {
    const { id, slug } = await openAuction({ minSeatsToDraw: 3, nonWinnerPolicy: "REFUND" });
    const u1 = await newUser();
    const u2 = await newUser();
    const u3 = await newUser();
    await auctions.buyTickets({ userId: u1, auctionId: id, count: 5, payment: { method: "wallet" } });
    await auctions.buyTickets({ userId: u2, auctionId: id, count: 3, payment: { method: "wallet" } });
    await auctions.buyTickets({ userId: u3, auctionId: id, count: 2, payment: { method: "wallet" } });

    const revenueBefore = await balanceOf(platformRevenue(PLATFORM));
    const w1 = await balanceOf(userWallet(u1));
    const w2 = await balanceOf(userWallet(u2));
    const w3 = await balanceOf(userWallet(u3));

    const commit = await auctions.commitDraw(id);
    expect(commit.seedCommitHash).toMatch(/^[0-9a-f]{64}$/);

    const result = await auctions.runDraw(id);
    expect(result.status).toBe("COMPLETED");
    expect(result.winnerUserId).toBeTruthy();
    expect(result.resultHash).toMatch(/^[0-9a-f]{64}$/);

    const winners = await prisma.winner.findMany({ where: { draw: { auctionId: id } } });
    expect(winners).toHaveLength(1);

    // the commitment verifies against the revealed seed
    const draw = await prisma.draw.findUniqueOrThrow({ where: { auctionId: id }, include: { entries: true } });
    expect(sha256Hex(draw.seedReveal!)).toBe(draw.seedCommitHash);

    // the winner's window contains hashUnit(seed:winner) * totalWeight
    const rWinner = parseInt(sha256Hex(`${draw.seedReveal}:winner`).slice(0, 13), 16) / 2 ** 52;
    const target = rWinner * draw.totalWeight;
    const winnerParticipant = await prisma.auctionParticipant.findFirstOrThrow({ where: { auctionId: id, userId: result.winnerUserId } });
    const winEntry = draw.entries.find((e) => e.participantId === winnerParticipant.id)!;
    expect(target).toBeGreaterThanOrEqual(winEntry.rangeStart);
    expect(target).toBeLessThan(winEntry.rangeEnd);

    // non-winners refunded to wallet; winner's stake → revenue; escrow drained
    const bySpent = { [u1]: 50_000, [u2]: 30_000, [u3]: 20_000 } as Record<string, number>;
    for (const [uid, before] of [[u1, w1], [u2, w2], [u3, w3]] as const) {
      const after = await balanceOf(userWallet(uid));
      if (uid === result.winnerUserId) expect(after).toBe(before);
      else expect(after - before).toBe(bySpent[uid]);
    }
    expect(await balanceOf(auctionEscrow(id))).toBe(0);
    const revenueAfter = await balanceOf(platformRevenue(PLATFORM));
    expect(revenueAfter - revenueBefore).toBe(bySpent[result.winnerUserId!]);

    // winner's tickets are WON, others DRAWN
    const wonCount = await prisma.auctionTicket.count({ where: { auctionId: id, status: "WON" } });
    expect(wonCount).toBeGreaterThan(0);
  });

  it("UNSOLD when the pool doesn't fill: everyone refunded in full", async () => {
    const { id } = await openAuction({ minSeatsToDraw: 50 });
    const u1 = await newUser();
    const before = await balanceOf(userWallet(u1));
    await auctions.buyTickets({ userId: u1, auctionId: id, count: 3, payment: { method: "wallet" } });
    expect(before - (await balanceOf(userWallet(u1)))).toBe(30_000);

    await auctions.commitDraw(id);
    const r = await auctions.runDraw(id);
    expect(r.status).toBe("UNSOLD");
    expect(await balanceOf(userWallet(u1))).toBe(before); // fully refunded
    expect(await balanceOf(auctionEscrow(id))).toBe(0);
    const refund = await prisma.auctionRefund.findFirst({ where: { auctionId: id, userId: u1 } });
    expect(refund?.reason).toBe("UNSOLD_DRAW");
  });
});

describe("prize claim + win-target purchase", () => {
  it("winner claims, passes KYC, is approved, then buys at winTarget → revenue", async () => {
    const { id, slug } = await openAuction({ minSeatsToDraw: 2, winTargetMinor: 150_000 });
    const u1 = await newUser();
    const u2 = await newUser();
    await auctions.buyTickets({ userId: u1, auctionId: id, count: 6, payment: { method: "wallet" } });
    await auctions.buyTickets({ userId: u2, auctionId: id, count: 1, payment: { method: "wallet" } });
    await auctions.commitDraw(id);
    const drawn = await auctions.runDraw(id);
    const winnerId = drawn.winnerUserId!;
    const winnerSlug = slug;

    const claim = await auctions.startPrizeClaim(winnerId, winnerSlug);
    expect(claim.status).toBe("OPEN");
    const kyc = await auctions.submitClaimKyc(winnerId, claim.claimId, {
      documents: [{ type: "ID_FRONT", fileKey: "k/1.jpg" }, { type: "SELFIE", fileKey: "k/2.jpg" }],
    });
    expect(kyc.status).toBe("VERIFYING");

    const staff = await makeUser("STAFF");
    trashUsers.push(staff.id);
    const review = await auctions.reviewPrizeClaim(staff.id, claim.claimId, "APPROVE");
    expect(review.status).toBe("APPROVED");

    const win = await auctions.getMyWin(winnerId, winnerSlug);
    expect(win.isWinner).toBe(true);

    const revenueBefore = await balanceOf(platformRevenue(PLATFORM));
    const walletBefore = await balanceOf(userWallet(winnerId));
    const buy = await auctions.purchaseWinTarget(winnerId, winnerSlug, { method: "wallet" });
    expect(buy.status).toBe("PAID");
    expect(buy.amountMinor).toBe(150_000);
    expect(walletBefore - (await balanceOf(userWallet(winnerId)))).toBe(150_000);
    expect((await balanceOf(platformRevenue(PLATFORM))) - revenueBefore).toBe(150_000);
  });
});
