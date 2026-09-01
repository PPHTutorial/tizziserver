import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  category: z.string().optional(),
  vendorId: z.string().optional(),
  sort: z.enum(["relevance", "newest", "price_asc", "price_desc", "rating"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(60).optional(),
});

/** Browse published products for the tenant. Scoping is by `Product.platformSlugs`. */
export const GET = withApi(
  { query: Query },
  async ({ ctx, query }) =>
    catalog.listProducts({
      platformSlug: ctx.platform,
      categorySlug: query.category,
      vendorId: query.vendorId,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit,
    }),
);
