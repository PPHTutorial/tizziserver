import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Ask a question about a product (answers come from the vendor / other buyers). */
export const POST = withApi(
  {
    body: z.object({ body: z.string().min(3).max(500) }),
    auth: true,
    rateLimit: { limit: 10, windowSec: 60, by: "principal" },
    audit: "catalog.question.ask",
  },
  async ({ body, ctx, params }) => {
    const productId = await catalog.resolveProductId(params.slug!, ctx.platform);
    return catalog.askQuestion(ctx.principal!.userId, productId, body.body);
  },
);
