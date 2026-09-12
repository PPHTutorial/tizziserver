import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: true, capability: "auction" }, async ({ ctx }) => auctions.myTicketStats(ctx.principal!.userId));
