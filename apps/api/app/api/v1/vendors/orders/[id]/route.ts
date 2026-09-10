import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** One incoming sub-order in full: items, payout split, fulfilment + timeline. */
export const GET = withApi({ auth: "VENDOR" }, async ({ ctx, params }) =>
  commerce.getVendorOrder(ctx.principal!.userId, params.id!),
);

/** Advance a sub-order through its prep states (ACCEPTED → … → HANDED_OVER). */
export const PATCH = withApi(
  {
    auth: "VENDOR",
    body: z.object({ status: z.enum(["ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "HANDED_OVER"]) }),
    audit: "commerce.vendor_order.status",
  },
  async ({ ctx, params, body }) => commerce.setVendorOrderStatus(ctx.principal!.userId, params.id!, body.status),
);
