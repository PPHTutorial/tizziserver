import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** A vendor's published catalogue. */
export const GET = withApi(
  {
    query: z.object({
      sort: z.enum(["relevance", "newest", "price_asc", "price_desc", "rating"]).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().int().positive().max(60).optional(),
    }),
  },
  async ({ ctx, params, query }) =>
    catalog.listProducts({
      platformSlug: ctx.platform,
      vendorId: params.id!,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit,
    }),
);
