import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

const AddBody = z.object({
  offerId: z.string().min(6),
  variantId: z.string().min(6).optional(),
  qty: z.number().int().positive().max(99).optional(),
});

/** Add an offer (optionally a variant) to the cart, or bump its quantity. */
export const POST = withApi(
  { auth: true, body: AddBody, rateLimit: { limit: 60, windowSec: 60, by: "principal" }, audit: "commerce.cart.add" },
  async ({ ctx, body }) =>
    commerce.addToCart({
      userId: ctx.principal!.userId,
      platformSlug: ctx.platform,
      offerId: body.offerId,
      variantId: body.variantId,
      qty: body.qty,
    }),
);
