import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ status: z.enum(["ANNOUNCED","OPEN","FILLING","CLOSING","DRAW_PENDING","DRAWING","COMPLETED","UNSOLD"]).optional() });
export const GET = withApi({ auth: false, capability: "auction", query: Query }, async ({ query }) => auctions.listAuctions(query));

