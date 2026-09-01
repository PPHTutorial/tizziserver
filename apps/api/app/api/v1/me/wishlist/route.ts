import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

export const GET = withApi({ auth: true }, async ({ ctx }) => ({
  items: await catalog.listWishlist(ctx.principal!.userId),
}));

export const POST = withApi(
  { auth: true, body: z.object({ productId: z.string().min(6) }), audit: "catalog.wishlist.add" },
  async ({ ctx, body }) => catalog.addToWishlist(ctx.principal!.userId, body.productId),
);

export const DELETE = withApi(
  { auth: true, body: z.object({ productId: z.string().min(6) }), audit: "catalog.wishlist.remove" },
  async ({ ctx, body }) => catalog.removeFromWishlist(ctx.principal!.userId, body.productId),
);
