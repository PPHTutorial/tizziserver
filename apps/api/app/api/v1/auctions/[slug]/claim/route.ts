import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: true, capability: "auction", audit: "auction.claim.start" }, async ({ ctx, params }) => auctions.startPrizeClaim(ctx.principal!.userId, params.slug!));

