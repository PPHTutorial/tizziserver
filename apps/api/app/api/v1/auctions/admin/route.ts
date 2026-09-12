import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(4000).optional(),
  type: z.enum(["SEAT_DRAW","PREMIUM_ASSET"]).optional(),
  regionCodes: z.array(z.string().length(2)).optional(),
  productId: z.string().optional(),
  offerId: z.string().optional(),
  retailValueMinor: z.number().int().positive(),
  ticketPriceMinor: z.number().int().positive(),
  winTargetMinor: z.number().int().positive(),
  seatsTotal: z.number().int().positive().max(1000000),
  minSeatsToDraw: z.number().int().positive().optional(),
  drawTrigger: z.enum(["SOLD_OUT","SCHEDULED","EITHER"]).optional(),
  nonWinnerPolicy: z.enum(["NONE","REFUND","CREDIT","VOUCHER"]).optional(),
  opensAt: z.string().datetime().optional(),
  closesAt: z.string().datetime().optional(),
  drawAt: z.string().datetime().optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  asset: z.object({ title: z.string(), media: z.array(z.string()).optional(), specs: z.record(z.string(), z.unknown()).optional() }).optional(),
  packages: z.array(z.object({ name: z.string(), ticketCount: z.number().int().positive(), bonusTickets: z.number().int().nonnegative().optional(), priceMinor: z.number().int().positive() })).optional(),
  qualificationRules: z.array(z.object({ factor: z.enum(["TICKETS","ENGAGEMENT","SHARE","REFERRAL"]), weight: z.number() })).optional(),
});
export const POST = withApi({ auth: ["STAFF","ADMIN"], capability: "auction", body: Body, audit: "auction.create" }, async ({ body }) => auctions.createAuction({
  ...body,
  opensAt: body.opensAt ? new Date(body.opensAt) : undefined,
  closesAt: body.closesAt ? new Date(body.closesAt) : undefined,
  drawAt: body.drawAt ? new Date(body.drawAt) : undefined,
}));

