import { payments } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Current state of one of the caller's payments (status + what to do next). No provider call. */
export const GET = withApi({ auth: true, rateLimit: { limit: 60, windowSec: 60, by: "principal" } }, async ({ ctx, params }) =>
  payments.getPaymentIntent(ctx.principal!.userId, params.id!),
);
