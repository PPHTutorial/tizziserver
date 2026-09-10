import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** The caller's active cart for this tenant (multi-vendor grouped). */
export const GET = withApi({ auth: true }, async ({ ctx }) =>
  commerce.getCart({ userId: ctx.principal!.userId, platformSlug: ctx.platform }),
);

/** Empty the cart. `?keepSaved=0` also clears save-for-later. */
export const DELETE = withApi(
  { auth: true, query: z.object({ keepSaved: z.enum(["0", "1"]).optional() }), audit: "commerce.cart.clear" },
  async ({ ctx, query }) =>
    commerce.clearCart({ userId: ctx.principal!.userId, platformSlug: ctx.platform, includeSaved: query.keepSaved === "0" }),
);
