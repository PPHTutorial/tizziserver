import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** Follow a storefront (idempotent). Returns `{ followerCount, isFollowing }`. */
export const POST = withApi(
  { auth: true, rateLimit: { limit: 60, windowSec: 60, by: "principal" } },
  async ({ ctx, params }) => catalog.followVendor(ctx.principal!.userId, params.id!, ctx.platform),
);

/** Unfollow (idempotent). */
export const DELETE = withApi(
  { auth: true, rateLimit: { limit: 60, windowSec: 60, by: "principal" } },
  async ({ ctx, params }) => catalog.unfollowVendor(ctx.principal!.userId, params.id!),
);
