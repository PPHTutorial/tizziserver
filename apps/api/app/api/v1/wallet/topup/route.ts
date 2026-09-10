import { z } from "zod";
import { wallet, AppError } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  amountMinor: z.number().int().min(100).max(100_000_00),
  gateway: z.string().max(24).optional(),
});

/** Fund the wallet through a payment gateway (mock sandbox by default). */
export const POST = withApi(
  { auth: true, capability: "wallet", body: Body, idempotent: true, rateLimit: { limit: 20, windowSec: 60, by: "principal" }, audit: "wallet.topup" },
  async ({ ctx, body }) => {
    const res = await wallet.initiateTopUp({
      userId: ctx.principal!.userId,
      amountMinor: body.amountMinor,
      platformSlug: ctx.platform,
      gateway: body.gateway,
    });
    if (res.status === "FAILED") {
      throw new AppError("PAYMENT_FAILED", res.failureReason ? `Top-up declined (${res.failureReason})` : "Top-up was declined");
    }
    return res;
  },
);
