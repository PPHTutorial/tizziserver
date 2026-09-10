import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Customer cancels a placed order before any seller has started preparing it.
 *  The captured total is refunded to the customer's wallet. */
export const POST = withApi(
  { auth: true, audit: "commerce.order.cancel" },
  async ({ ctx, params }) => commerce.cancelOrder(ctx.principal!.userId, params.id!),
);
