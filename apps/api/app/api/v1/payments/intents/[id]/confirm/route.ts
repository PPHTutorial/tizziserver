import { payments } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * The app polls this while the customer approves a payment (MoMo prompt,
 * hosted card page, bank transfer…): verifies with Flutterwave and settles now
 * instead of waiting for the webhook. Idempotent with it. Returns the intent
 * view: `status` SUCCEEDED / FAILED, or still pending with its `nextAction`.
 */
export const POST = withApi(
  { auth: true, rateLimit: { limit: 30, windowSec: 60, by: "principal" } },
  async ({ ctx, params }) => payments.confirmPaymentIntent(ctx.principal!.userId, params.id!),
);
