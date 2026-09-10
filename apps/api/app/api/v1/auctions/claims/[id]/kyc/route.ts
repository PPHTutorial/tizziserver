import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ documents: z.array(z.object({ type: z.string().min(2).max(40), fileKey: z.string().min(1).max(300) })).min(1).max(10) });
export const POST = withApi({ auth: true, capability: "auction", body: Body, audit: "auction.claim.kyc" }, async ({ ctx, params, body }) => auctions.submitClaimKyc(ctx.principal!.userId, params.id!, body));

