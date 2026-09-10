import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  method: z.enum(["DELIVERY","PICKUP","DIGITAL","PAYOUT"]),
  dropoff: z.object({ lat: z.number(), lng: z.number(), address: z.record(z.string(), z.unknown()), contactName: z.string().optional(), contactPhone: z.string().optional() }).optional(),
});
export const POST = withApi({ auth: ["STAFF","ADMIN"], capability: "auction", body: Body, audit: "auction.prize.fulfil" }, async ({ ctx, params, body }) => auctions.fulfilPrize(ctx.principal!.userId, params.id!, body));

