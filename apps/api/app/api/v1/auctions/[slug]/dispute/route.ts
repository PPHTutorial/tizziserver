import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ body: z.string().min(3).max(2000), evidence: z.unknown().optional() });
export const POST = withApi({ auth: true, capability: "auction", body: Body, audit: "auction.dispute" }, async ({ ctx, params, body }) => auctions.openAuctionDispute(ctx.principal!.userId, params.slug!, body));

