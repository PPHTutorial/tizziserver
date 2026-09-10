import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: false, capability: "auction", query: z.object({ limit: z.coerce.number().int().positive().max(100).optional() }) }, async ({ params, query }) => auctions.auctionLeaderboard(params.slug!, query.limit));

