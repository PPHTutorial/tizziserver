/**
 * Draw engine — auditable commit-reveal weighted selection.
 *
 * `commitDraw` publishes `sha256(seed)` before the pool closes; `runDraw` reveals
 * the seed, builds weighted `DrawEntry` windows from participant qualification
 * scores, picks a `Winner` + backups deterministically from the seed, and
 * publishes `resultHash` — anyone can recompute the outcome. Weighting only
 * changes the window widths; it never guarantees selection.
 *
 * Money: ticket stakes sit in `auctionEscrow`. On a completed (sold-out) draw,
 * non-winners are settled per `nonWinnerPolicy` — the default, `NONE`, keeps
 * their stake (it funds the below-retail win target, which is the whole
 * mechanic); REFUND/CREDIT send it to the wallet instead, VOUCHER issues a
 * coupon — all three are opt-in exceptions, not the norm. Either way,
 * whatever isn't paid out to a non-winner releases to platform REVENUE. Only
 * an UNSOLD draw (didn't reach `minSeatsToDraw`) refunds everyone in full —
 * that's the *only* case a non-winner gets their stake back by default.
 * `auctionEscrow` nets to zero either way.
 */
import { prisma, type Prisma } from "@stall/db";
import { AppError } from "../errors.ts";
import { randomToken, sha256Hex } from "../crypto.ts";
import { auctionEscrow, platformRevenue, postTxn, userWallet } from "../wallet/ledger.ts";
import { getOrCreateWallet, refundToWallet } from "../wallet/wallet.ts";
import { recomputeAuctionRanks } from "./qualification.ts";

/** Deterministic float in [0,1) from a string. */
function hashUnit(s: string): number {
  const hex = sha256Hex(s).slice(0, 13); // 52 bits
  return parseInt(hex, 16) / 2 ** 52;
}

async function paidByUser(auctionId: string): Promise<Map<string, number>> {
  const intents = await prisma.paymentIntent.findMany({
    where: { purpose: "TICKET", status: "SUCCEEDED", metadata: { path: ["auctionId"], equals: auctionId } },
    select: { userId: true, amountMinor: true },
  });
  const m = new Map<string, number>();
  for (const i of intents) m.set(i.userId, (m.get(i.userId) ?? 0) + i.amountMinor);
  return m;
}

/** Move the auction to DRAW_PENDING and publish the seed commitment. */
export async function commitDraw(auctionId: string) {
  const a = await prisma.auction.findUnique({ where: { id: auctionId }, include: { draw: true } });
  if (!a) throw new AppError("NOT_FOUND", "Auction not found");
  if (a.draw) return { drawId: a.draw.id, seedCommitHash: a.draw.seedCommitHash, status: a.status };
  if (!["OPEN", "FILLING", "CLOSING"].includes(a.status)) {
    throw new AppError("CONFLICT", `Can't commit a draw for a ${a.status} auction`);
  }
  const seed = randomToken(32);
  const draw = await prisma.$transaction(async (tx) => {
    const d = await tx.draw.create({
      data: {
        auctionId,
        method: "COMMIT_REVEAL",
        seedCommitHash: sha256Hex(seed),
        seedReveal: seed, // stored now; the read layer hides it until completedAt
      },
    });
    await tx.auction.update({ where: { id: auctionId }, data: { status: "DRAW_PENDING" } });
    await tx.outboxEvent.create({
      data: { type: "auction.draw_committed", aggregateType: "Auction", aggregateId: auctionId, payload: { slug: a.slug, seedCommitHash: d.seedCommitHash } },
    });
    return d;
  });
  return { drawId: draw.id, seedCommitHash: draw.seedCommitHash, status: "DRAW_PENDING" as const };
}

export async function markUnsold(auctionId: string) {
  const a = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!a) throw new AppError("NOT_FOUND", "Auction not found");
  const paid = await paidByUser(auctionId);

  for (const [userId, amountMinor] of paid) {
    if (amountMinor <= 0) continue;
    await getOrCreateWallet(userId, a.currency);
    const { ledgerTxnId } = await refundFromAuctionEscrow(auctionId, userId, amountMinor, a.currency, `Wallet Refund (Unsold Draw) — ${a.title}`);
    const ticketIds = (await prisma.auctionTicket.findMany({ where: { auctionId, userId }, select: { id: true } })).map((t) => t.id);
    await prisma.auctionRefund.create({
      data: { auctionId, userId, ticketIds, amountMinor, reason: "UNSOLD_DRAW", status: "DONE", ledgerTxnId },
    });
  }
  await prisma.$transaction([
    prisma.auctionTicket.updateMany({ where: { auctionId }, data: { status: "REFUNDED" } }),
    prisma.auction.update({ where: { id: auctionId }, data: { status: "UNSOLD", completedAt: new Date() } }),
    prisma.outboxEvent.create({ data: { type: "auction.unsold", aggregateType: "Auction", aggregateId: auctionId, payload: { slug: a.slug } } }),
  ]);
  return { status: "UNSOLD" as const, refunded: paid.size };
}

async function refundFromAuctionEscrow(auctionId: string, userId: string, amountMinor: number, currency: string, memo: string) {
  return prisma.$transaction(async (tx) => {
    const txn = await postTxn(
      {
        type: "REFUND",
        memo,
        reference: { auctionId, userId },
        lines: [
          { account: auctionEscrow(auctionId, currency), direction: "DEBIT", amountMinor },
          { account: userWallet(userId, currency), direction: "CREDIT", amountMinor },
        ],
      },
      tx,
    );
    const w = await tx.wallet.findUnique({ where: { userId } });
    if (w) {
      const balanceAfter = (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: w.accountId } })).balanceMinor;
      await tx.walletTransaction.create({
        data: { walletId: w.id, ledgerTxnId: txn.id, directionLabel: "credit", amountMinor, balanceAfterMinor: balanceAfter, description: memo, meta: { auctionId } as Prisma.InputJsonValue },
      });
    }
    return { ledgerTxnId: txn.id };
  });
}

export interface DrawResult {
  status: "COMPLETED" | "UNSOLD";
  winnerUserId?: string;
  backups?: string[];
  resultHash?: string;
}

export async function runDraw(auctionId: string): Promise<DrawResult> {
  const a = await prisma.auction.findUnique({ where: { id: auctionId }, include: { draw: true, assets: true } });
  if (!a) throw new AppError("NOT_FOUND", "Auction not found");
  if (!a.draw) throw new AppError("CONFLICT", "Commit the draw first");
  if (a.status === "COMPLETED" || a.status === "UNSOLD") return { status: a.status as "COMPLETED" | "UNSOLD" };

  const soldSeats = await prisma.auctionTicket.count({ where: { auctionId, status: { in: ["ACTIVE", "DRAWN", "WON"] } } });
  const participants = await prisma.auctionParticipant.findMany({ where: { auctionId } });
  if (soldSeats < a.minSeatsToDraw || participants.length === 0) {
    return markUnsold(auctionId);
  }

  await prisma.auction.update({ where: { id: auctionId }, data: { status: "DRAWING" } });
  await recomputeAuctionRanks(auctionId);
  const ranked = await prisma.auctionParticipant.findMany({ where: { auctionId }, orderBy: [{ qualificationScore: "desc" }, { joinedAt: "asc" }] });

  // weighted windows — fall back to ticket count if every score is zero
  const anyScore = ranked.some((p) => p.qualificationScore > 0);
  const weightOf = (p: (typeof ranked)[number]) => (anyScore ? Math.max(p.qualificationScore, 0.0001) : Math.max(p.ticketCount, 1));

  let cursor = 0;
  const entries = ranked.map((p) => {
    const w = weightOf(p);
    const start = cursor;
    cursor += w;
    return { participantId: p.id, userId: p.userId, weight: w, rangeStart: start, rangeEnd: cursor };
  });
  const totalWeight = cursor;
  const seed = a.draw.seedReveal!;

  const pick = (salt: string, exclude: Set<string>) => {
    const pool = entries.filter((e) => !exclude.has(e.participantId));
    const tw = pool.reduce((n, e) => n + e.weight, 0);
    if (tw <= 0) return null;
    const target = hashUnit(`${seed}:${salt}`) * tw;
    let acc = 0;
    for (const e of pool) {
      acc += e.weight;
      if (target < acc) return e;
    }
    return pool[pool.length - 1] ?? null;
  };

  const winner = pick("winner", new Set());
  if (!winner) return markUnsold(auctionId);
  const excluded = new Set([winner.participantId]);
  const backups: typeof entries = [];
  for (let k = 1; k <= 3 && backups.length < 3 && excluded.size < entries.length; k++) {
    const b = pick(`backup:${k}`, excluded);
    if (!b) break;
    backups.push(b);
    excluded.add(b.participantId);
  }

  const resultHash = sha256Hex(`${seed}|${JSON.stringify(entries.map((e) => [e.participantId, e.rangeStart, e.rangeEnd]))}|${winner.participantId}`);

  await prisma.$transaction(async (tx) => {
    await tx.drawEntry.createMany({
      data: entries.map((e) => ({ drawId: a.draw!.id, participantId: e.participantId, weight: e.weight, rangeStart: e.rangeStart, rangeEnd: e.rangeEnd })),
    });
    await tx.draw.update({
      where: { id: a.draw!.id },
      data: { entryCount: entries.length, totalWeight, resultHash, startedAt: new Date(), completedAt: new Date() },
    });
    await tx.winner.create({ data: { drawId: a.draw!.id, participantId: winner.participantId, position: "PRIMARY", assetId: a.assets[0]?.id, status: "PENDING_CLAIM" } });
    for (let i = 0; i < backups.length; i++) {
      await tx.backupWinner.create({ data: { drawId: a.draw!.id, participantId: backups[i]!.participantId, order: i + 1 } });
    }
    await tx.auctionTicket.updateMany({ where: { auctionId, userId: winner.userId }, data: { status: "WON" } });
    await tx.auctionTicket.updateMany({ where: { auctionId, userId: { not: winner.userId }, status: "ACTIVE" }, data: { status: "DRAWN" } });
    await tx.auction.update({ where: { id: auctionId }, data: { status: "COMPLETED", completedAt: new Date() } });
    await tx.outboxEvent.create({
      data: { type: "auction.draw_completed", aggregateType: "Auction", aggregateId: auctionId, payload: { slug: a.slug, winnerUserId: winner.userId, resultHash } },
    });
  });

  // --- settle escrow: non-winner policy, then remainder → revenue ---
  // nonWinnerPolicy "NONE" (the default) intentionally matches neither
  // branch below — that stake just stays in escrow and gets swept to
  // revenue in the remainder step, same as VOUCHER.
  const paid = await paidByUser(auctionId);
  for (const [userId, amountMinor] of paid) {
    if (userId === winner.userId || amountMinor <= 0) continue;
    if (a.nonWinnerPolicy === "REFUND" || a.nonWinnerPolicy === "CREDIT") {
      const memo = a.nonWinnerPolicy === "CREDIT" ? `Draw credit — ${a.title}` : `Wallet Refund (Non-winner) — ${a.title}`;
      const { ledgerTxnId } = await refundFromAuctionEscrow(auctionId, userId, amountMinor, a.currency, memo);
      const ticketIds = (await prisma.auctionTicket.findMany({ where: { auctionId, userId }, select: { id: true } })).map((t) => t.id);
      await prisma.auctionRefund.create({ data: { auctionId, userId, ticketIds, amountMinor, reason: "NON_WINNER", status: "DONE", ledgerTxnId } });
    } else if (a.nonWinnerPolicy === "VOUCHER") {
      await prisma.coupon.create({
        data: {
          code: `DRAW-${a.slug.slice(0, 8).toUpperCase()}-${userId.slice(-5).toUpperCase()}`,
          type: "FIXED",
          value: amountMinor,
          platformSlug: a.platformSlug,
          perUserLimit: 1,
          maxRedemptions: 1,
          endsAt: new Date(Date.now() + 90 * 86_400_000),
        },
      }).catch(() => {});
      // voucher = the stake stays in escrow and releases to revenue below
    }
  }

  const remaining = (await prisma.ledgerAccount.findUnique({
    where: { ownerType_ownerId_currency_kind: { ownerType: "ESCROW", ownerId: `auction:${auctionId}`, currency: a.currency, kind: "ESCROW" } },
  }))?.balanceMinor ?? 0;
  if (remaining > 0) {
    await postTxn({
      type: "RELEASE",
      memo: `Draw settlement — ${a.slug}`,
      reference: { auctionId },
      lines: [
        { account: auctionEscrow(auctionId, a.currency), direction: "DEBIT", amountMinor: remaining },
        { account: platformRevenue(a.platformSlug, a.currency), direction: "CREDIT", amountMinor: remaining },
      ],
    });
  }

  return { status: "COMPLETED", winnerUserId: winner.userId, backups: backups.map((b) => b.userId), resultHash };
}

/** Worker: auctions whose `drawAt` has passed and aren't resolved yet. */
export async function dueDraws() {
  const now = new Date();
  const due = await prisma.auction.findMany({
    where: {
      platformSlug: "grandprice",
      status: { in: ["OPEN", "FILLING", "CLOSING", "DRAW_PENDING"] },
      drawTrigger: { in: ["SCHEDULED", "EITHER"] },
      drawAt: { lte: now },
    },
    select: { id: true, status: true },
    take: 20,
  });
  const results: { auctionId: string; status: string }[] = [];
  for (const a of due) {
    try {
      if (a.status !== "DRAW_PENDING") await commitDraw(a.id);
      const r = await runDraw(a.id);
      results.push({ auctionId: a.id, status: r.status });
    } catch (e) {
      console.error("[draw] due", a.id, e);
    }
  }
  // sold-out auctions with SOLD_OUT / EITHER trigger
  const soldOut = await prisma.auction.findMany({
    where: { platformSlug: "grandprice", status: "CLOSING", drawTrigger: { in: ["SOLD_OUT", "EITHER"] } },
    select: { id: true },
    take: 20,
  });
  for (const a of soldOut) {
    try {
      await commitDraw(a.id);
      const r = await runDraw(a.id);
      results.push({ auctionId: a.id, status: r.status });
    } catch (e) {
      console.error("[draw] sold-out", a.id, e);
    }
  }
  return results;
}
