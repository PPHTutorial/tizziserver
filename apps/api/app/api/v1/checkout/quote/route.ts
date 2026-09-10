import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  fulfilmentMethod: z.enum(["DELIVERY", "PICKUP", "VENDOR_LOGISTICS"]).optional(),
  couponCode: z.string().max(40).optional(),
});

/** Price the caller's cart: fee lines, coupon, per-vendor breakdown. No writes. */
export const POST = withApi({ auth: true, body: Body }, async ({ ctx, body }) =>
  commerce.quoteCheckout({
    userId: ctx.principal!.userId,
    platformSlug: ctx.platform,
    fulfilmentMethod: body.fulfilmentMethod,
    couponCode: body.couponCode,
  }),
);
