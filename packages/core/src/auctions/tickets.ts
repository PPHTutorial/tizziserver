/**
 * Ticket (= seat) purchase + reads. Money flows into a per-auction escrow
 * account and is released to platform REVENUE (or refunded to wallets) only
 * once the draw resolves — see `draw.ts`.
 */
import { prisma, type Prisma, type TicketSource } from "@stall/db";
import { AppError } from "../errors.ts";
import { randomToken } from "../crypto.ts";
import { auctionEscrow, gatewayClearing, postTxn, userWallet } from "../wallet/ledger.ts";
import { getOrCreateWallet, walletBalanceMinor } from "../wallet/wallet.ts";
import { gatewayFor } from "../payments/providers.ts";
import { recomputeParticipant } from "./qualification.ts";
import { refreshAuctionFill } from "./auctions.ts";

const CUR = "GHS";

async function walletTxnRow(
  tx: Prisma.TransactionClient,
  userId: string,
  args: { ledgerTxnId: string; direction: "credit" | "debit"; amountMinor: number; description: string; meta?: Record<string, unknown> },
) {
  const w = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  const balanceAfter = (await tx.ledgerAccount.findUniqueOrThrow({ where: { id: w.accountId } })).balanceMinor;
  await tx.walletTransaction.create({
    data: {
      walletId: w.id,
      ledgerTxnId: args.ledgerTxnId,
      directionLabel: args.direction,
      amountMinor: args.amountMinor,
      balanceAfterMinor: balanceAfter,
      description: args.description,
      meta: (args.meta ?? undefined) as Prisma.InputJsonValue,
    },
  });
}

export interface BuyTicketsInput {
  userId: string;
  auctionId: string;
  packageId?: string;
  count?: number;
  payment: { method: "wallet" | "gateway"; gateway?: string };
}

export async function buyTickets(input: BuyTicketsInput) {
  const auction = await prisma.auction.findUnique({ where: { id: input.auctionId } });
  if (!auction) throw new AppError("NOT_FOUND", "Auction not found");
  if (!["OPEN", "FILLING", "ANNOUNCED"].includes(auction.status)) {
    throw new AppError("CONFLICT", `This draw is ${auction.status.toLowerCase()} — seats aren't on sale`);
  }
  if (auction.opensAt && auction.opensAt > new Date()) throw new AppError("CONFLICT", "Seats aren't on sale yet");

  let quantity: number;
  let bonus = 0;
  let priceMinor: number;
  if (input.packageId) {
    const pkg = await prisma.ticketPackage.findFirst({ where: { id: input.packageId, auctionId: auction.id, active: true } });
    if (!pkg) throw new AppError("NOT_FOUND", "Ticket package not found");
    quantity = pkg.ticketCount;
    bonus = pkg.bonusTickets;
    priceMinor = pkg.priceMinor;
  } else {
    quantity = Math.max(1, Math.trunc(input.count ?? 1));
    if (quantity > 100) throw new AppError("VALIDATION", "Max 100 seats per purchase");
    priceMinor = quantity * auction.ticketPriceMinor;
  }

  const total = quantity + bonus;
  const sold = await prisma.auctionTicket.count({ where: { auctionId: auction.id, status: { in: ["ACTIVE", "DRAWN", "WON"] } } });
  if (sold + total > auction.seatsTotal) {
    throw new AppError("CONFLICT", `Only ${Math.max(0, auction.seatsTotal - sold)} seat(s) left`);
  }

  // --- settle payment into the auction escrow ---------------------
  const pi = await prisma.paymentIntent.create({
    data: {
      userId: input.userId,
      purpose: "TICKET",
      amountMinor: priceMinor,
      currency: auction.currency,
      status: "PROCESSING",
      gateway: input.payment.method === "wallet" ? "wallet" : gatewayFor(input.payment.gateway).name,
      metadata: { auctionId: auction.id, quantity, bonus } as Prisma.InputJsonValue,
    },
  });

  try {
    if (input.payment.method === "wallet") {
      await getOrCreateWallet(input.userId, auction.currency);
      const bal = await walletBalanceMinor(input.userId, auction.currency);
      if (bal < priceMinor) throw new AppError("INSUFFICIENT_FUNDS", "Wallet balance is too low", { balanceMinor: bal, requiredMinor: priceMinor });
      await prisma.$transaction(async (tx) => {
        const txn = await postTxn(
          {
            type: "HOLD",
            memo: `Seats · ${auction.slug}`,
            reference: { auctionId: auction.id, paymentIntentId: pi.id },
            lines: [
              { account: userWallet(input.userId, auction.currency), direction: "DEBIT", amountMinor: priceMinor },
              { account: auctionEscrow(auction.id, auction.currency), direction: "CREDIT", amountMinor: priceMinor },
            ],
          },
          tx,
        );
        await walletTxnRow(tx, input.userId, { ledgerTxnId: txn.id, direction: "debit", amountMinor: priceMinor, description: `Seats — ${auction.title}`, meta: { auctionId: auction.id } });
      });
    } else {
      const gw = gatewayFor(input.payment.gateway);
      const intent = await gw.createIntent({ amountMinor: priceMinor, currency: auction.currency, purpose: "TICKET", reference: pi.id, userId: input.userId });
      const cap = await gw.capture(intent.ref, priceMinor);
      if (!cap.ok) {
        await prisma.$transaction([
          prisma.payment.create({ data: { intentId: pi.id, status: "FAILED", gatewayResponse: cap.raw as Prisma.InputJsonValue } }),
          prisma.paymentIntent.update({ where: { id: pi.id }, data: { status: "FAILED" } }),
        ]);
        throw new AppError("PAYMENT_FAILED", cap.failureReason ? `Payment declined (${cap.failureReason})` : "Payment was declined");
      }
      await prisma.$transaction(async (tx) => {
        await tx.payment.create({ data: { intentId: pi.id, status: "SUCCEEDED", capturedMinor: cap.capturedMinor, feeMinor: cap.feeMinor, gatewayResponse: cap.raw as Prisma.InputJsonValue, processedAt: new Date() } });
        await tx.paymentIntent.update({ where: { id: pi.id }, data: { status: "SUCCEEDED", gatewayRef: intent.ref } });
        await postTxn(
          {
            type: "HOLD",
            memo: `Seats · ${auction.slug} (${gw.name})`,
            reference: { auctionId: auction.id, paymentIntentId: pi.id, gatewayRef: intent.ref },
            lines: [
              { account: gatewayClearing(auction.platformSlug, auction.currency), direction: "DEBIT", amountMinor: priceMinor },
              { account: auctionEscrow(auction.id, auction.currency), direction: "CREDIT", amountMinor: priceMinor },
            ],
          },
          tx,
        );
      });
    }
  } catch (e) {
    await prisma.paymentIntent.update({ where: { id: pi.id }, data: { status: "FAILED" } }).catch(() => {});
    throw e;
  }

  // --- mint seats + roll projections ----------------------------
  const participant = await prisma.$transaction(async (tx) => {
    if (input.payment.method === "wallet") {
      await tx.paymentIntent.update({ where: { id: pi.id }, data: { status: "SUCCEEDED" } });
    }
    const startSeat = sold;
    const rows: { serial: string; seatNo: number; source: TicketSource }[] = [];
    for (let i = 0; i < quantity; i++) rows.push({ serial: seatSerial(auction.slug), seatNo: startSeat + i + 1, source: "PURCHASE" });
    for (let i = 0; i < bonus; i++) rows.push({ serial: seatSerial(auction.slug), seatNo: startSeat + quantity + i + 1, source: "BONUS" });
    await tx.auctionTicket.createMany({
      data: rows.map((r) => ({ auctionId: auction.id, userId: input.userId, packageId: input.packageId, serial: r.serial, seatNo: r.seatNo, source: r.source, paymentIntentId: pi.id })),
    });

    const tw = await tx.ticketWallet.upsert({
      where: { userId_auctionId: { userId: input.userId, auctionId: auction.id } },
      create: { userId: input.userId, auctionId: auction.id, activeCount: total },
      update: { activeCount: { increment: total } },
    });
    const p = await tx.auctionParticipant.upsert({
      where: { auctionId_userId: { auctionId: auction.id, userId: input.userId } },
      create: { auctionId: auction.id, userId: input.userId, ticketCount: total },
      update: { ticketCount: { increment: total } },
    });
    await tx.qualificationEvent.create({ data: { participantId: p.id, factor: "TICKETS", points: total, ref: { paymentIntentId: pi.id } as Prisma.InputJsonValue } });
    await tx.outboxEvent.create({ data: { type: "auction.tickets_bought", aggregateType: "Auction", aggregateId: auction.id, payload: { userId: input.userId, total, walletCount: tw.activeCount } } });
    return p;
  });

  await recomputeParticipant(participant.id);
  await refreshAuctionFill(auction.id);

  const score = (await prisma.auctionParticipant.findUnique({ where: { id: participant.id } }))?.qualificationScore ?? 0;
  return { ticketsMinted: total, quantity, bonus, amountMinor: priceMinor, walletCount: participant.ticketCount, qualificationScore: score };
}

function seatSerial(slug: string): string {
  return `${slug.slice(0, 6).toUpperCase()}-${randomToken(5).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8).padEnd(8, "0")}`;
}

// ------------------------------------------------------------ reads

export async function myTicketWallets(userId: string) {
  const rows = await prisma.ticketWallet.findMany({
    where: { userId },
    include: { auction: { select: { slug: true, title: true, status: true, drawAt: true, seatsSold: true, seatsTotal: true, currency: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return {
    items: rows.map((w) => ({
      auctionSlug: w.auction.slug,
      auctionTitle: w.auction.title,
      auctionStatus: w.auction.status,
      drawAt: w.auction.drawAt?.toISOString() ?? null,
      activeCount: w.activeCount,
      fillPct: w.auction.seatsTotal ? Math.round((w.auction.seatsSold / w.auction.seatsTotal) * 100) : 0,
    })),
  };
}

const LIVE_AUCTION_STATUSES = ["ANNOUNCED", "OPEN", "FILLING", "CLOSING"];

/** Profile-card summary (Figma's `profile-screen` frame: Total Tickets /
 * Amount Won / Active Entries) — nothing computed this across all of a
 * user's auctions before; each existing endpoint was scoped to one auction. */
export async function myTicketStats(userId: string) {
  const wallets = await prisma.ticketWallet.findMany({
    where: { userId },
    include: { auction: { select: { status: true, currency: true } } },
  });
  const totalTickets = wallets.reduce((sum, w) => sum + w.activeCount, 0);
  const activeEntries = wallets.filter(
    (w) => w.activeCount > 0 && LIVE_AUCTION_STATUSES.includes(w.auction.status),
  ).length;

  const winners = await prisma.winner.findMany({
    where: { participant: { userId }, status: { not: "FORFEITED" } },
    include: { participant: { select: { auction: { select: { retailValueMinor: true, currency: true } } } } },
  });
  const amountWonMinor = winners.reduce((sum, w) => sum + w.participant.auction.retailValueMinor, 0);
  const currency = winners[0]?.participant.auction.currency ?? wallets[0]?.auction.currency ?? "GHS";

  return { totalTickets, activeEntries, amountWonMinor, currency };
}

export async function myTickets(userId: string, auctionSlug: string) {
  const auction = await prisma.auction.findUnique({ where: { slug: auctionSlug }, select: { id: true, currency: true } });
  if (!auction) throw new AppError("NOT_FOUND", "Auction not found");
  const tickets = await prisma.auctionTicket.findMany({
    where: { userId, auctionId: auction.id },
    orderBy: { seatNo: "asc" },
  });
  return {
    items: tickets.map((t) => ({ serial: t.serial, seatNo: t.seatNo, source: t.source, status: t.status, acquiredAt: t.acquiredAt.toISOString() })),
  };
}
