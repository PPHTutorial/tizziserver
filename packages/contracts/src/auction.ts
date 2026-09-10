import { z } from "zod";
import { ok } from "./envelope.ts";

/**
 * Phase 5 — Inverse Draws / auctions (GrandPrice only; every op is
 * `capability: "auction"` gated). Mirrors `@stall/core/auctions` + `/api/v1/auctions*`.
 * Qualification is **weighting, never a guarantee** — reflected in field names.
 */

export const AuctionStatus = z.enum([
  "DRAFT", "ANNOUNCED", "OPEN", "FILLING", "CLOSING", "DRAW_PENDING", "DRAWING", "COMPLETED", "UNSOLD", "CANCELLED",
]);
export const QualFactor = z.enum(["TICKETS", "ENGAGEMENT", "SHARE", "REFERRAL"]);

export const TicketPackage = z.object({
  id: z.string(),
  name: z.string(),
  ticketCount: z.number().int(),
  bonusTickets: z.number().int(),
  priceMinor: z.number().int(),
});

export const AuctionCard = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.enum(["SEAT_DRAW", "PREMIUM_ASSET"]),
  status: AuctionStatus,
  currency: z.string(),
  retailValueMinor: z.number().int(),
  ticketPriceMinor: z.number().int(),
  winTargetMinor: z.number().int(),
  seatsTotal: z.number().int(),
  seatsSold: z.number().int(),
  seatsLeft: z.number().int(),
  fillPct: z.number().int(),
  minSeatsToDraw: z.number().int(),
  drawTrigger: z.enum(["SOLD_OUT", "SCHEDULED", "EITHER"]),
  nonWinnerPolicy: z.enum(["REFUND", "CREDIT", "VOUCHER"]),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  drawAt: z.string().nullable(),
  participants: z.number().int(),
  image: z.string().nullable(),
  packages: z.array(TicketPackage),
});

export const AuctionDetail = AuctionCard.extend({
  assets: z.array(z.object({ id: z.string(), title: z.string(), media: z.array(z.string()), specs: z.unknown().nullable(), retailValueMinor: z.number().int() })),
  rules: z.unknown().nullable(),
  qualificationRules: z.array(z.object({ factor: QualFactor, weight: z.number() })),
  productId: z.string().nullable(),
  offerId: z.string().nullable(),
  completedAt: z.string().nullable(),
  mine: z
    .object({ ticketCount: z.number().int(), qualificationScore: z.number(), rank: z.number().int().nullable(), eligible: z.boolean() })
    .nullable(),
  draw: z
    .object({
      status: AuctionStatus,
      method: z.string(),
      seedCommitHash: z.string(),
      seedReveal: z.string().nullable(),
      resultHash: z.string().nullable(),
      completedAt: z.string().nullable(),
      winnerIsMe: z.boolean(),
    })
    .nullable(),
});

export const AuctionsResponse = ok(z.object({ items: z.array(AuctionCard) }));
export const AuctionDetailResponse = ok(AuctionDetail);

export const LeaderboardResponse = ok(
  z.object({ items: z.array(z.object({ rank: z.number().int(), name: z.string(), ticketCount: z.number().int(), qualificationScore: z.number() })) }),
);

export const QualificationView = z.object({
  qualificationScore: z.number(),
  rank: z.number().int().nullable(),
  totalParticipants: z.number().int(),
  eligible: z.boolean(),
  ticketCount: z.number().int(),
  breakdown: z.array(z.object({ factor: QualFactor, weight: z.number(), points: z.number(), contribution: z.number() })),
  note: z.string(),
});
export const QualificationResponse = ok(QualificationView);
export const QualifyRequest = z.object({
  factor: z.enum(["ENGAGEMENT", "SHARE", "REFERRAL"]),
  key: z.string().max(120).optional(),
  points: z.number().positive().max(25).optional(),
});
export const QualifyResponse = ok(z.object({ recorded: z.boolean(), qualificationScore: z.number() }));

export const BuyTicketsRequest = z.object({
  packageId: z.string().optional(),
  count: z.number().int().positive().max(100).optional(),
  payment: z.object({ method: z.enum(["wallet", "gateway"]), gateway: z.string().max(24).optional() }),
});
export const BuyTicketsResponse = ok(
  z.object({
    ticketsMinted: z.number().int(),
    quantity: z.number().int(),
    bonus: z.number().int(),
    amountMinor: z.number().int(),
    walletCount: z.number().int(),
    qualificationScore: z.number(),
  }),
);

export const TicketWalletsResponse = ok(
  z.object({
    items: z.array(
      z.object({
        auctionSlug: z.string(),
        auctionTitle: z.string(),
        auctionStatus: AuctionStatus,
        drawAt: z.string().nullable(),
        activeCount: z.number().int(),
        fillPct: z.number().int(),
      }),
    ),
  }),
);
export const MyTicketsResponse = ok(
  z.object({ items: z.array(z.object({ serial: z.string(), seatNo: z.number().int().nullable(), source: z.string(), status: z.string(), acquiredAt: z.string() })) }),
);

export const MyWinResponse = ok(z.unknown());
export const ClaimResponse = ok(z.object({ claimId: z.string(), status: z.string() }));
export const ClaimKycRequest = z.object({ documents: z.array(z.object({ type: z.string(), fileKey: z.string() })).min(1) });
export const WinPurchaseRequest = z.object({ payment: z.object({ method: z.enum(["wallet", "gateway"]), gateway: z.string().max(24).optional() }) });
export const WinPurchaseResponse = ok(z.object({ id: z.string(), status: z.string(), amountMinor: z.number().int() }));
export const DisputeRequest = z.object({ body: z.string().min(3).max(2000), evidence: z.unknown().optional() });
export const IdStatusResponse = ok(z.object({ id: z.string(), status: z.string() }));

// --- STAFF / ADMIN ---
export const CreateAuctionRequest = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(4000).optional(),
  type: z.enum(["SEAT_DRAW", "PREMIUM_ASSET"]).optional(),
  regionCodes: z.array(z.string().length(2)).optional(),
  productId: z.string().optional(),
  offerId: z.string().optional(),
  retailValueMinor: z.number().int().positive(),
  ticketPriceMinor: z.number().int().positive(),
  winTargetMinor: z.number().int().positive(),
  seatsTotal: z.number().int().positive(),
  minSeatsToDraw: z.number().int().positive().optional(),
  drawTrigger: z.enum(["SOLD_OUT", "SCHEDULED", "EITHER"]).optional(),
  nonWinnerPolicy: z.enum(["REFUND", "CREDIT", "VOUCHER"]).optional(),
  opensAt: z.string().datetime().optional(),
  closesAt: z.string().datetime().optional(),
  drawAt: z.string().datetime().optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  asset: z.object({ title: z.string(), media: z.array(z.string()).optional(), specs: z.record(z.string(), z.unknown()).optional() }).optional(),
  packages: z.array(z.object({ name: z.string(), ticketCount: z.number().int().positive(), bonusTickets: z.number().int().nonnegative().optional(), priceMinor: z.number().int().positive() })).optional(),
  qualificationRules: z.array(z.object({ factor: QualFactor, weight: z.number() })).optional(),
});
export const CreateAuctionResponse = ok(z.object({ id: z.string(), slug: z.string(), status: z.string() }));
export const StatusRequest = z.object({ status: AuctionStatus });
export const StatusResponse = ok(z.object({ id: z.string(), status: z.string() }));
export const DrawCommitResponse = ok(z.object({ drawId: z.string(), seedCommitHash: z.string(), status: z.string() }));
export const DrawRunResponse = ok(z.object({ status: z.string(), winnerUserId: z.string().optional(), backups: z.array(z.string()).optional(), resultHash: z.string().optional() }));
export const ClaimReviewRequest = z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().max(500).optional() });
export const ClaimReviewResponse = ok(z.object({ claimId: z.string(), status: z.string(), backupPromoted: z.boolean().optional() }));
export const FulfilRequest = z.object({
  method: z.enum(["DELIVERY", "PICKUP", "DIGITAL", "PAYOUT"]),
  dropoff: z.object({ lat: z.number(), lng: z.number(), address: z.record(z.string(), z.unknown()), contactName: z.string().optional(), contactPhone: z.string().optional() }).optional(),
});
export const FulfilResponse = ok(z.object({ claimId: z.string(), status: z.string(), deliveryId: z.string().nullable() }));
