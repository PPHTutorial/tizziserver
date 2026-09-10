import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({ amountMinor: z.number().int().positive(), pin: z.string().min(4).max(6), payoutAccountId: z.string().optional() });

/** The vendor's payout history. */
export const GET = withApi({ auth: "VENDOR" }, async ({ ctx }) => ({
  items: await commerce.listVendorPayouts(ctx.principal!.userId),
}));

/** PIN-gated: cash out the accrued PAYABLE balance from completed sub-orders. */
export const POST = withApi(
  { auth: "VENDOR", body: Body, audit: "vendor.payout.request" },
  async ({ ctx, body }) =>
    commerce.requestVendorPayout({
      userId: ctx.principal!.userId,
      platformSlug: ctx.platform,
      amountMinor: body.amountMinor,
      pin: body.pin,
      payoutAccountId: body.payoutAccountId,
    }),
);
