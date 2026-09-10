import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Dry-run a coupon against the caller's current cart. */
export const POST = withApi(
  { auth: true, capability: "coupons", body: z.object({ code: z.string().min(2).max(40) }) },
  async ({ ctx, body }) => {
    const cart = await commerce.getCart({ userId: ctx.principal!.userId, platformSlug: ctx.platform });
    return commerce.evaluateCoupon(body.code, {
      userId: ctx.principal!.userId,
      platformSlug: ctx.platform,
      subtotalMinor: cart.subtotalMinor,
      vendorIds: cart.groups.map((g) => g.vendorId),
      categorySlugs: cart.groups.flatMap((g) => g.items.map((i) => i.categorySlug).filter(Boolean) as string[]),
    });
  },
);
