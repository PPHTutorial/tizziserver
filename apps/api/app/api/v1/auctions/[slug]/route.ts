import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: false, capability: "auction" }, async ({ ctx, params }) => auctions.getAuction(params.slug!, ctx.principal?.userId));

