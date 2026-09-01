import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
});

/** Create or replace the caller's review for a product. */
export const POST = withApi(
  { body: Body, auth: true, rateLimit: { limit: 10, windowSec: 60, by: "principal" }, audit: "catalog.review.add" },
  async ({ body, ctx, params }) => {
    const productId = await catalog.resolveProductId(params.slug!, ctx.platform);
    return catalog.addReview({ userId: ctx.principal!.userId, productId, ...body });
  },
);
