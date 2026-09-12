import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Submit a draft for admin review (needs image + price) — no longer goes
 * straight live; it moves to PENDING_REVIEW until an admin approves it. */
export const POST = withApi(
  { auth: "VENDOR", audit: "vendor.product.submit_review" },
  async ({ ctx, params }) => catalog.publishProduct(ctx.principal!.userId, params.id!),
);
