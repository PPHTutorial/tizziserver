import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  status: z.enum(["NEW", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "HANDED_OVER", "COMPLETED", "CANCELLED"]).optional(),
});

/** The vendor's incoming sub-orders. */
export const GET = withApi({ auth: "VENDOR", query: Query }, async ({ ctx, query }) => ({
  items: await commerce.listVendorOrders(ctx.principal!.userId, query),
}));
