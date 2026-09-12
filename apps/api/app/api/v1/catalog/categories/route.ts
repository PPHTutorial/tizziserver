import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * Category list for the caller's tenant — flat, `?tree=1` nested, or
 * `?filter=trending|new|auction` for the top-level "Browse categories" grid
 * ranked by a real signal instead of `sortOrder`.
 */
export const GET = withApi(
  {
    query: z.object({
      tree: z.enum(["0", "1"]).optional(),
      filter: z.enum(["all", "trending", "new", "auction"]).optional(),
    }),
  },
  async ({ ctx, query }) => {
    if (query.filter) {
      return { roots: await catalog.rootCategories(ctx.platform, query.filter === "all" ? undefined : query.filter) };
    }
    return query.tree === "1"
      ? { tree: await catalog.categoryTree(ctx.platform) }
      : { items: await catalog.listCategories(ctx.platform) };
  },
);
