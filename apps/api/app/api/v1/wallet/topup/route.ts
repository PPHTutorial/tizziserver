import { z } from "zod";
import { wallet, payments, AppError } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  amountMinor: z.number().int().min(100).max(100_000_00),
  gateway: z.string().max(24).optional(),
  // card = Flutterwave's hosted page (in-app browser); the rest are charged in-app.
  method: z.enum(payments.PAYMENT_METHOD_KINDS).optional(),
  details: z
    .object({
      phone: z.string().max(20).optional(),
      network: z.string().max(20).optional(),
      bankCode: z.string().max(10).optional(),
      accountNumber: z.string().max(20).optional(),
    })
    .strict()
    .optional(),
});

/**
 * Fund the wallet through a payment gateway (mock sandbox by default). With
 * Flutterwave the response is `REQUIRES_ACTION`/`PROCESSING` + `nextAction`;
 * the app follows it and polls `POST /payments/intents/{id}/confirm`.
 * `Idempotency-Key` makes a retried tap return the same intent, never a
 * second charge.
 */
export const POST = withApi(
  { auth: true, capability: "wallet", body: Body, idempotent: true, rateLimit: { limit: 20, windowSec: 60, by: "principal" }, audit: "wallet.topup" },
  async ({ ctx, body }) => {
    const res = await wallet.initiateTopUp({
      userId: ctx.principal!.userId,
      amountMinor: body.amountMinor,
      platformSlug: ctx.platform,
      gateway: body.gateway,
      method: body.method,
      details: body.details,
      idempotencyKey: ctx.idempotencyKey ?? undefined,
    });
    if (res.status === "FAILED") {
      throw new AppError("PAYMENT_FAILED", res.failureReason ? `Top-up declined (${res.failureReason})` : "Top-up was declined");
    }
    return res;
  },
);
