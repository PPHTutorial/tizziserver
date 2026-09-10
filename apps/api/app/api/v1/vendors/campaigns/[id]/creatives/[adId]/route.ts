import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  slot: z.enum(["HOME_RAIL", "SEARCH_TOP", "CATEGORY_TOP", "PRODUCT_RELATED", "CHECKOUT_CROSS_SELL"]).optional(),
  headline: z.string().max(120).optional(),
  subtext: z.string().max(200).optional(),
  imageKey: z.string().optional(),
  productId: z.string().optional(),
  destinationRoute: z.string().optional(),
  weight: z.number().int().min(1).max(1000).optional(),
  isActive: z.boolean().optional(),
});
export const PATCH = withApi({ auth: "VENDOR", capability: "advertising", body: Body }, async ({ ctx, body, params }) =>
  ads.updateCreative(ctx.principal!.userId, params.adId!, body),
);
export const DELETE = withApi({ auth: "VENDOR", capability: "advertising" }, async ({ ctx, params }) =>
  ads.removeCreative(ctx.principal!.userId, params.adId!),
);
