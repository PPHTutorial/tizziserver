import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ packageId: z.string().optional(), count: z.number().int().positive().max(100).optional(), payment: z.object({ method: z.enum(["wallet","gateway"]), gateway: z.string().max(24).optional() }) });
export const POST = withApi({ auth: true, capability: "auction", idempotent: true, body: Body, audit: "auction.buy_tickets" }, async ({ ctx, params, body }) => {
  const { resolveAuctionId, buyTickets } = auctions;
  const auctionId = await resolveAuctionId(params.slug!);
  return buyTickets({ userId: ctx.principal!.userId, auctionId, packageId: body.packageId, count: body.count, payment: body.payment });
});

