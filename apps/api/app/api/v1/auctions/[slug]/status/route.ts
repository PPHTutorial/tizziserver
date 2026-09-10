import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ status: z.enum(["ANNOUNCED","OPEN","FILLING","CLOSING","DRAW_PENDING","DRAWING","COMPLETED","UNSOLD","CANCELLED"]) });
export const POST = withApi({ auth: ["STAFF","ADMIN"], capability: "auction", body: Body, audit: "auction.status" }, async ({ params, body }) => {
  const id = await auctions.resolveAuctionId(params.slug!);
  return auctions.setAuctionStatus(id, body.status);
});

