import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ payment: z.object({ method: z.enum(["wallet","gateway"]), gateway: z.string().max(24).optional() }) });
export const POST = withApi({ auth: true, capability: "auction", idempotent: true, body: Body, audit: "auction.win_purchase" }, async ({ ctx, params, body }) => auctions.purchaseWinTarget(ctx.principal!.userId, params.slug!, body.payment));

