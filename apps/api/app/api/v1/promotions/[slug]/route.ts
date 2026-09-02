import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** A single promotion with its (published) items resolved to cards. */
export const GET = withApi({}, async ({ ctx, params }) =>
  catalog.promotionBySlug(params.slug!, ctx.platform),
);
