import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Category list for the caller's tenant — flat, or `?tree=1` nested. */
export const GET = withApi(
  { query: z.object({ tree: z.enum(["0", "1"]).optional() }) },
  async ({ ctx, query }) =>
    query.tree === "1"
      ? { tree: await catalog.categoryTree(ctx.platform) }
      : { items: await catalog.listCategories(ctx.platform) },
);
