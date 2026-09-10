import { z } from "zod";
import { wallet } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  amountMinor: z.number().int().positive(),
  pin: z.string().min(4).max(6),
});

/** PIN-gated wallet withdrawal → debits the wallet, opens a PENDING payout. */
export const POST = withApi(
  { auth: true, capability: "wallet.withdraw", body: Body, rateLimit: { limit: 10, windowSec: 300, by: "principal" }, audit: "wallet.withdraw" },
  async ({ ctx, body }) =>
    wallet.requestWithdrawal({
      userId: ctx.principal!.userId,
      amountMinor: body.amountMinor,
      pin: body.pin,
      platformSlug: ctx.platform,
    }),
);
