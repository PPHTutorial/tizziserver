import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  q: z.string().min(1).max(120),
  category: z.string().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "newest"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(60).optional(),
});

/** Weighted full-text + trigram product search, tenant-scoped. */
export const GET = withApi({ query: Query }, async ({ ctx, query }) =>
  catalog.searchProducts({
    platformSlug: ctx.platform,
    q: query.q,
    categorySlug: query.category,
    minPriceMinor: query.minPrice,
    maxPriceMinor: query.maxPrice,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  }),
);
