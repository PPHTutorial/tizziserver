import { payments } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * The app calls this when the customer returns from a hosted checkout
 * (Paystack): verifies with the provider and settles now instead of waiting
 * for the webhook. Idempotent with it. `{ status }` is SUCCEEDED / FAILED, or
 * still REQUIRES_ACTION if the customer hasn't finished paying.
 */
export const POST = withApi(
  { auth: true, rateLimit: { limit: 30, windowSec: 60, by: "principal" } },
  async ({ ctx, params }) => payments.confirmPaymentIntent(ctx.principal!.userId, params.id!),
);
