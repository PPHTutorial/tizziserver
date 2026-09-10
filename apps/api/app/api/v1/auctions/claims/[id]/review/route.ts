import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ decision: z.enum(["APPROVE","REJECT"]), note: z.string().max(500).optional() });
export const POST = withApi({ auth: ["STAFF","ADMIN"], capability: "auction", body: Body, audit: "auction.claim.review" }, async ({ ctx, params, body }) => auctions.reviewPrizeClaim(ctx.principal!.userId, params.id!, body.decision, body.note));

