import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Pause or resume the vendor's own offer for this listing. */
export const POST = withApi(
  { auth: "VENDOR", body: z.object({ paused: z.boolean() }), audit: "vendor.product.pause" },
  async ({ ctx, params, body }) =>
    catalog.setListingPaused(ctx.principal!.userId, params.id!, body.paused),
);
