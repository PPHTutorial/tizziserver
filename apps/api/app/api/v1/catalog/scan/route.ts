import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({ code: z.string().min(1) });

/** Barcode/SKU scan → product slug, or null if nothing matches. */
export const GET = withApi(
  { query: Query },
  async ({ ctx, query }) => ({ slug: await catalog.findProductByCode(query.code, ctx.platform) }),
);
