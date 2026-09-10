import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  key: z.string().min(2).max(40),
  name: z.string().min(2).max(80),
  description: z.string().max(400).optional(),
  platformSlugs: z.array(z.string()).min(1),
  billingModel: z.enum(["CPM", "CPC", "FLAT_DAILY"]),
  priceMinor: z.number().int().nonnegative(),
  rankBoostBps: z.number().int().min(10000).max(50000).optional(),
  placements: z.array(z.enum(["HOME_RAIL", "SEARCH_TOP", "CATEGORY_TOP", "PRODUCT_RELATED", "CHECKOUT_CROSS_SELL"])).min(1),
  badge: z.string().max(24).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export const GET = withApi({ auth: ["STAFF", "ADMIN"] }, async () => ads.listAllBoostTiers());
export const POST = withApi({ auth: ["ADMIN"], body: Body, audit: "boost_tier.upsert" }, async ({ body }) => ads.upsertBoostTier(body));
