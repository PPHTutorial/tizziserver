/**
 * Inverse Draw lifecycle + reads.
 *
 * A SEAT_DRAW auction sells a fixed pool of seats at `ticketPriceMinor`. When
 * the pool sells out (or `drawAt` passes with `minSeatsToDraw` met) a `Draw`
 * runs. UI copy + this model treat qualification/seat-holding as **weighting,
 * never a guarantee** — `Winner` is strictly a `Draw` output.
 */
import { prisma, type Prisma, type AuctionStatus, type AuctionType, type DrawTrigger, type NonWinnerPolicy } from "@stall/db";
import { AppError } from "../errors.ts";
import { uniqueSlug } from "../catalog/util.ts";

const TENANT = "grandprice";

// ----------------------------------------------------------- reads

const listInclude = {
  assets: true,
  packages: { where: { active: true }, orderBy: { sortOrder: "asc" } },
  _count: { select: { participants: true } },
} satisfies Prisma.AuctionInclude;

function shapeAuctionCard(a: Prisma.AuctionGetPayload<{ include: typeof listInclude }>) {
  const sold = a.seatsSold;
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    description: a.description,
    type: a.type,
    status: a.status,
    currency: a.currency,
    retailValueMinor: a.retailValueMinor,
    ticketPriceMinor: a.ticketPriceMinor,
    winTargetMinor: a.winTargetMinor,
    seatsTotal: a.seatsTotal,
    seatsSold: sold,
    seatsLeft: Math.max(0, a.seatsTotal - sold),
    fillPct: a.seatsTotal ? Math.round((sold / a.seatsTotal) * 100) : 0,
    minSeatsToDraw: a.minSeatsToDraw,
    drawTrigger: a.drawTrigger,
    nonWinnerPolicy: a.nonWinnerPolicy,
    opensAt: a.opensAt?.toISOString() ?? null,
    closesAt: a.closesAt?.toISOString() ?? null,
    drawAt: a.drawAt?.toISOString() ?? null,
    participants: a._count.participants,
    image: a.assets[0]?.media[0] ?? null,
    packages: a.packages.map((p) => ({
      id: p.id,
      name: p.name,
      ticketCount: p.ticketCount,
      bonusTickets: p.bonusTickets,
      priceMinor: p.priceMinor,
    })),
  };
}

export async function listAuctions(opts: { status?: AuctionStatus } = {}) {
  const rows = await prisma.auction.findMany({
    where: {
      platformSlug: TENANT,
      status: opts.status ?? { in: ["ANNOUNCED", "OPEN", "FILLING", "CLOSING", "DRAW_PENDING", "DRAWING", "COMPLETED"] },
    },
    orderBy: [{ status: "asc" }, { drawAt: "asc" }],
    include: listInclude,
  });
  return { items: rows.map(shapeAuctionCard) };
}

export async function getAuction(slug: string, userId?: string) {
  const a = await prisma.auction.findFirst({
    where: { slug, platformSlug: TENANT },
    include: {
      ...listInclude,
      qualRules: true,
      draw: { include: { winners: { include: { participant: { select: { userId: true } } } } } },
    },
  });
  if (!a) throw new AppError("NOT_FOUND", "Auction not found");

  let mine: { ticketCount: number; qualificationScore: number; rank: number | null; eligible: boolean } | null = null;
  if (userId) {
    const p = await prisma.auctionParticipant.findUnique({
      where: { auctionId_userId: { auctionId: a.id, userId } },
    });
    if (p) {
      mine = { ticketCount: p.ticketCount, qualificationScore: p.qualificationScore, rank: p.rank, eligible: p.eligible };
    }
  }

  const card = shapeAuctionCard(a);
  return {
    ...card,
    assets: a.assets.map((x) => ({ id: x.id, title: x.title, media: x.media, specs: x.specs, retailValueMinor: x.retailValueMinor })),
    rules: a.rules,
    qualificationRules: a.qualRules.map((r) => ({ factor: r.factor, weight: r.weight })),
    productId: a.productId,
    offerId: a.offerId,
    completedAt: a.completedAt?.toISOString() ?? null,
    mine,
    draw: a.draw
      ? {
          status: a.status,
          method: a.draw.method,
          seedCommitHash: a.draw.seedCommitHash,
          // The seed is the draw's secret input — publishing it before the
          // draw actually runs would let anyone compute the winning
          // weight-range in advance. Only reveal it once the draw is done,
          // when it becomes the public proof of a fair, un-tampered result.
          seedReveal: a.draw.completedAt ? a.draw.seedReveal : null,
          resultHash: a.draw.resultHash,
          completedAt: a.draw.completedAt?.toISOString() ?? null,
          winnerIsMe: userId ? a.draw.winners.some((w) => w.participant.userId === userId) : false,
        }
      : null,
  };
}

// ----------------------------------------------------- admin authoring

export interface CreateAuctionInput {
  title: string;
  description?: string;
  type?: AuctionType;
  regionCodes?: string[];
  productId?: string;
  offerId?: string;
  retailValueMinor: number;
  ticketPriceMinor: number;
  winTargetMinor: number;
  seatsTotal: number;
  minSeatsToDraw?: number;
  drawTrigger?: DrawTrigger;
  nonWinnerPolicy?: NonWinnerPolicy;
  opensAt?: Date;
  closesAt?: Date;
  drawAt?: Date;
  rules?: Record<string, unknown>;
  asset?: { title: string; media?: string[]; specs?: Record<string, unknown> };
  packages?: { name: string; ticketCount: number; bonusTickets?: number; priceMinor: number }[];
  qualificationRules?: { factor: "TICKETS" | "ENGAGEMENT" | "SHARE" | "REFERRAL"; weight: number }[];
}

export async function createAuction(input: CreateAuctionInput) {
  if (input.winTargetMinor >= input.retailValueMinor) {
    throw new AppError("VALIDATION", "winTarget must be below retail value");
  }
  const slug = uniqueSlug(input.title);
  const a = await prisma.auction.create({
    data: {
      slug,
      title: input.title,
      description: input.description,
      type: input.type ?? "SEAT_DRAW",
      status: "DRAFT",
      platformSlug: TENANT,
      regionCodes: input.regionCodes ?? [],
      productId: input.productId,
      offerId: input.offerId,
      retailValueMinor: input.retailValueMinor,
      ticketPriceMinor: input.ticketPriceMinor,
      winTargetMinor: input.winTargetMinor,
      seatsTotal: input.seatsTotal,
      minSeatsToDraw: input.minSeatsToDraw ?? Math.ceil(input.seatsTotal * 0.6),
      drawTrigger: input.drawTrigger ?? "EITHER",
      nonWinnerPolicy: input.nonWinnerPolicy ?? "NONE",
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      drawAt: input.drawAt,
      rules: (input.rules ?? undefined) as Prisma.InputJsonValue,
      assets: input.asset
        ? { create: { title: input.asset.title, media: input.asset.media ?? [], specs: (input.asset.specs ?? undefined) as Prisma.InputJsonValue, retailValueMinor: input.retailValueMinor } }
        : undefined,
      packages: input.packages
        ? { create: input.packages.map((p, i) => ({ name: p.name, ticketCount: p.ticketCount, bonusTickets: p.bonusTickets ?? 0, priceMinor: p.priceMinor, sortOrder: i })) }
        : undefined,
      qualRules: {
        create: (input.qualificationRules ?? [
          { factor: "TICKETS" as const, weight: 1 },
          { factor: "ENGAGEMENT" as const, weight: 0.2 },
          { factor: "SHARE" as const, weight: 0.15 },
          { factor: "REFERRAL" as const, weight: 0.25 },
        ]).map((r) => ({ factor: r.factor, weight: r.weight })),
      },
    },
  });
  return { id: a.id, slug: a.slug, status: a.status };
}

const TRANSITIONS: Partial<Record<AuctionStatus, AuctionStatus[]>> = {
  DRAFT: ["ANNOUNCED", "CANCELLED"],
  ANNOUNCED: ["OPEN", "CANCELLED"],
  OPEN: ["FILLING", "CLOSING", "DRAW_PENDING", "CANCELLED"],
  FILLING: ["CLOSING", "DRAW_PENDING", "CANCELLED"],
  CLOSING: ["DRAW_PENDING", "CANCELLED"],
  DRAW_PENDING: ["DRAWING", "UNSOLD", "CANCELLED"],
  DRAWING: ["COMPLETED", "UNSOLD"],
};

export async function setAuctionStatus(auctionId: string, next: AuctionStatus) {
  const a = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!a) throw new AppError("NOT_FOUND", "Auction not found");
  if (!(TRANSITIONS[a.status] ?? []).includes(next)) {
    throw new AppError("CONFLICT", `Can't move an auction from ${a.status} to ${next}`);
  }
  const patch: Prisma.AuctionUpdateInput = { status: next };
  if (next === "ANNOUNCED") patch.announcedAt = new Date();
  if (next === "OPEN" && !a.opensAt) patch.opensAt = new Date();
  await prisma.auction.update({ where: { id: auctionId }, data: patch });
  await prisma.outboxEvent.create({
    data: { type: `auction.${next.toLowerCase()}`, aggregateType: "Auction", aggregateId: auctionId, payload: { slug: a.slug } },
  });
  return { id: auctionId, status: next };
}

export async function resolveAuctionId(slug: string): Promise<string> {
  const a = await prisma.auction.findFirst({ where: { slug, platformSlug: TENANT }, select: { id: true } });
  if (!a) throw new AppError("NOT_FOUND", "Auction not found");
  return a.id;
}

export async function openAuctionDispute(userId: string, slug: string, input: { body: string; evidence?: unknown }) {
  const auctionId = await resolveAuctionId(slug);
  const d = await prisma.auctionDispute.create({
    data: { auctionId, userId, body: input.body, evidence: (input.evidence ?? undefined) as Prisma.InputJsonValue },
  });
  return { id: d.id, status: d.status };
}

/** Recompute the seatsSold projection from ACTIVE tickets + auto-advance status. */
export async function refreshAuctionFill(auctionId: string) {
  const a = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!a) return;
  const sold = await prisma.auctionTicket.count({ where: { auctionId, status: { in: ["ACTIVE", "DRAWN", "WON"] } } });
  let status = a.status;
  if (["OPEN", "FILLING"].includes(a.status)) {
    status = sold >= a.seatsTotal ? "CLOSING" : sold > 0 ? "FILLING" : "OPEN";
  }
  await prisma.auction.update({ where: { id: auctionId }, data: { seatsSold: sold, status } });
  if (status === "CLOSING" && a.status !== "CLOSING") {
    await prisma.outboxEvent.create({
      data: { type: "auction.sold_out", aggregateType: "Auction", aggregateId: auctionId, payload: { slug: a.slug, seatsSold: sold } },
    });
  }
}
