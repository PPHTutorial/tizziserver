import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Attach a coupon code to the cart (revalidated on every read + at checkout). */
export const POST = withApi(
  { auth: true, capability: "coupons", body: z.object({ code: z.string().min(2).max(40) }), audit: "commerce.coupon.apply" },
  async ({ ctx, body }) =>
    commerce.applyCoupon({ userId: ctx.principal!.userId, platformSlug: ctx.platform, code: body.code }),
);

export const DELETE = withApi(
  { auth: true, audit: "commerce.coupon.remove" },
  async ({ ctx }) => commerce.removeCoupon({ userId: ctx.principal!.userId, platformSlug: ctx.platform }),
);
