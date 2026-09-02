import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** "You might also like" — same-category published products. */
export const GET = withApi(
  { query: z.object({ limit: z.coerce.number().int().positive().max(20).optional() }) },
  async ({ ctx, params, query }) => ({
    items: await catalog.similarProducts(params.slug!, ctx.platform, query.limit ?? 8),
  }),
);
