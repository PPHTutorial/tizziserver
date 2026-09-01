import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Full product detail: media, variants, every active vendor offer, reviews, Q&A. */
export const GET = withApi({}, async ({ ctx, params }) => {
  const detail = await catalog.getProductDetail(params.slug!, ctx.platform);
  // Best-effort "recently viewed" for signed-in shoppers.
  if (ctx.principal) {
    void catalog.recordView(ctx.principal.userId, detail.id).catch(() => {});
  }
  return detail;
});
