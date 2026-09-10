import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  status: z.enum(["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"]).optional(),
});

/** The vendor's return queue. */
export const GET = withApi({ auth: "VENDOR", query: Query }, async ({ ctx, query }) => ({
  items: await commerce.listVendorReturns(ctx.principal!.userId, query),
}));
