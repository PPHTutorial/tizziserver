/**
 * Qualification engine.
 *
 * `qualificationScore = Σ_factor ( rule.weight · Σ points(factor) )`. It re-ranks
 * the weighted draw — it is **never a guarantee** and the API/DTO names
 * (`qualificationScore`, `weight`, `eligible`, `rank`) keep it that way.
 */
import { prisma, type QualFactor } from "@stall/db";
import { AppError } from "../errors.ts";

/** Recompute one participant's score from their events + the auction's weights. */
export async function recomputeParticipant(participantId: string): Promise<number> {
  const p = await prisma.auctionParticipant.findUnique({
    where: { id: participantId },
    include: { qualEvents: true, auction: { include: { qualRules: true } } },
  });
  if (!p) return 0;

  const weights = new Map<QualFactor, number>(p.auction.qualRules.map((r) => [r.factor, r.weight]));
  const points = new Map<QualFactor, number>();
  for (const e of p.qualEvents) points.set(e.factor, (points.get(e.factor) ?? 0) + e.points);

  let score = 0;
  for (const [factor, pts] of points) score += (weights.get(factor) ?? 0) * pts;
  score = Math.round(score * 1000) / 1000;

  await prisma.auctionParticipant.update({ where: { id: participantId }, data: { qualificationScore: score } });
  return score;
}

/** Recompute every participant + assign dense ranks (highest score = rank 1). */
export async function recomputeAuctionRanks(auctionId: string) {
  const participants = await prisma.auctionParticipant.findMany({ where: { auctionId }, select: { id: true } });
  for (const p of participants) await recomputeParticipant(p.id);

  const ordered = await prisma.auctionParticipant.findMany({
    where: { auctionId },
    orderBy: [{ qualificationScore: "desc" }, { joinedAt: "asc" }],
    select: { id: true },
  });
  await Promise.all(ordered.map((p, i) => prisma.auctionParticipant.update({ where: { id: p.id }, data: { rank: i + 1 } })));
  return { ranked: ordered.length };
}

async function participantFor(userId: string, auctionSlug: string) {
  const auction = await prisma.auction.findUnique({ where: { slug: auctionSlug }, select: { id: true, status: true } });
  if (!auction) throw new AppError("NOT_FOUND", "Auction not found");
  const p = await prisma.auctionParticipant.findUnique({ where: { auctionId_userId: { auctionId: auction.id, userId } } });
  if (!p) throw new AppError("NOT_FOUND", "Join the draw first");
  return { auctionId: auction.id, auctionStatus: auction.status, participant: p };
}

const DEDUPE_FACTORS: QualFactor[] = ["ENGAGEMENT", "SHARE", "REFERRAL"];

/** Defensive ceiling on a factor's cumulative points per participant — the
 * per-event cap (25) alone doesn't bound how many events a client can send. */
const MAX_TOTAL_POINTS_PER_FACTOR = 100;

/** Record a non-ticket qualification signal. `key` de-dupes repeat actions and
 * is required for the client-attestable factors — without it there's no way
 * to tell a real action from an unbounded replay of the same request. */
export async function recordQualification(
  userId: string,
  auctionSlug: string,
  factor: "ENGAGEMENT" | "SHARE" | "REFERRAL",
  input: { points?: number; key?: string; ref?: Record<string, unknown> } = {},
) {
  const { auctionStatus, participant } = await participantFor(userId, auctionSlug);
  if (!["OPEN", "FILLING", "ANNOUNCED"].includes(auctionStatus)) {
    throw new AppError("CONFLICT", "This draw is no longer accepting qualification activity");
  }

  const points = Math.min(input.points ?? 1, 25);

  if (DEDUPE_FACTORS.includes(factor)) {
    if (!input.key) throw new AppError("VALIDATION", "A dedupe key is required for this qualification factor");
    const dup = await prisma.qualificationEvent.findFirst({
      where: { participantId: participant.id, factor, ref: { path: ["key"], equals: input.key } },
    });
    if (dup) return { recorded: false as const, qualificationScore: participant.qualificationScore };
  }

  const existing = await prisma.qualificationEvent.aggregate({
    where: { participantId: participant.id, factor },
    _sum: { points: true },
  });
  if ((existing._sum.points ?? 0) + points > MAX_TOTAL_POINTS_PER_FACTOR) {
    throw new AppError("CONFLICT", "You've reached the maximum qualification activity for this factor");
  }

  await prisma.qualificationEvent.create({
    data: { participantId: participant.id, factor, points, ref: { key: input.key, ...(input.ref ?? {}) } as never },
  });
  const score = await recomputeParticipant(participant.id);
  return { recorded: true as const, qualificationScore: score };
}

export async function getQualification(userId: string, auctionSlug: string) {
  const { auctionId, participant } = await participantFor(userId, auctionSlug);
  const rules = await prisma.qualificationRule.findMany({ where: { auctionId } });
  const events = await prisma.qualificationEvent.findMany({ where: { participantId: participant.id } });
  const total = await prisma.auctionParticipant.count({ where: { auctionId } });

  const byFactor = new Map<QualFactor, number>();
  for (const e of events) byFactor.set(e.factor, (byFactor.get(e.factor) ?? 0) + e.points);

  return {
    qualificationScore: participant.qualificationScore,
    rank: participant.rank,
    totalParticipants: total,
    eligible: participant.eligible,
    ticketCount: participant.ticketCount,
    breakdown: rules.map((r) => {
      const pts = byFactor.get(r.factor) ?? 0;
      return { factor: r.factor, weight: r.weight, points: pts, contribution: Math.round(r.weight * pts * 1000) / 1000 };
    }),
    note: "Qualification weights your odds in the draw. It does not guarantee a win.",
  };
}

export async function auctionLeaderboard(auctionSlug: string, limit = 20) {
  const auction = await prisma.auction.findUnique({ where: { slug: auctionSlug }, select: { id: true } });
  if (!auction) throw new AppError("NOT_FOUND", "Auction not found");
  const rows = await prisma.auctionParticipant.findMany({
    where: { auctionId: auction.id },
    orderBy: [{ qualificationScore: "desc" }, { joinedAt: "asc" }],
    take: Math.min(limit, 100),
    include: { user: { select: { firstName: true } } },
  });
  return {
    items: rows.map((r, i) => ({
      rank: r.rank ?? i + 1,
      name: r.user.firstName ?? "Participant",
      ticketCount: r.ticketCount,
      qualificationScore: r.qualificationScore,
    })),
  };
}
