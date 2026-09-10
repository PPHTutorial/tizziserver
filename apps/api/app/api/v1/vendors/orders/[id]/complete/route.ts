import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Vendor marks a sub-order COMPLETED → escrow releases payout + commission. */
export const POST = withApi(
  { auth: "VENDOR", audit: "commerce.vendor_order.complete" },
  async ({ ctx, params }) => commerce.completeVendorOrder(ctx.principal!.userId, params.id!),
);
