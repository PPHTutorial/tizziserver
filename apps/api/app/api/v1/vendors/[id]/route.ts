import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Public vendor storefront header (+ `isFollowing` when signed in). */
export const GET = withApi({}, async ({ ctx, params }) =>
  catalog.getVendorPage(params.id!, ctx.platform, ctx.principal?.userId),
);
