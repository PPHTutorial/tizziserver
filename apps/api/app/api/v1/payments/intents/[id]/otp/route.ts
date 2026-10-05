import { z } from "zod";
import { payments } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * Submit the one-time code for a charge whose `nextAction` is `otp` (bank
 * account debit, some MoMo). Capped at 5 attempts per payment server-side.
 */
export const POST = withApi(
  {
    auth: true,
    body: z.object({ otp: z.string().regex(/^\d{4,8}$/) }),
    rateLimit: { limit: 10, windowSec: 300, by: "principal" },
    audit: "payment.otp",
  },
  async ({ ctx, params, body }) => payments.submitPaymentOtp(ctx.principal!.userId, params.id!, body.otp),
);
