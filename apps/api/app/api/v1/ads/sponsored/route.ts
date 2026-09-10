import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({
  slot: z.enum(["HOME_RAIL", "SEARCH_TOP", "CATEGORY_TOP", "PRODUCT_RELATED", "CHECKOUT_CROSS_SELL"]),
  categoryId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
/** Sponsored creatives for a placement slot. Impressions are logged by the client via POST /ads/events. */
export const GET = withApi({ auth: false, query: Query, rateLimit: { limit: 120, windowSec: 60 } }, async ({ ctx, query }) =>
  ads.sponsoredCards({ platformSlug: ctx.platform, slot: query.slot, categoryId: query.categoryId, limit: query.limit }),
);
