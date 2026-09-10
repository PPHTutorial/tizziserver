import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: ["ADMIN"], capability: "auction", audit: "auction.draw.commit" }, async ({ params }) => {
  const id = await auctions.resolveAuctionId(params.slug!);
  return auctions.commitDraw(id);
});

