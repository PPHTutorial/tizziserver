import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  limit: z.coerce.number().int().positive().max(30).optional(),
});

/** Top-rated active vendors with at least one live listing — backs the home
 * feed's "Featured vendors" rail and its "View all" destination screen. */
export const GET = withApi({ query: Query }, async ({ ctx, query }) => ({
  items: await catalog.listFeaturedVendors({ platformSlug: ctx.platform, limit: query.limit ?? 30 }),
}));
