import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Move a draft to PUBLISHED and activate its offer (needs image + price). */
export const POST = withApi(
  { auth: "VENDOR", audit: "vendor.product.publish" },
  async ({ ctx, params }) => catalog.publishProduct(ctx.principal!.userId, params.id!),
);
