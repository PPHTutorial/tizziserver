import { z } from "zod";
import { commerce } from "@stall/core";
import { AppError } from "@stall/core";
import { withApi } from "@/src/http/route";

const PatchBody = z.object({
  qty: z.number().int().min(0).max(99).optional(),
  savedForLater: z.boolean().optional(),
});

export const PATCH = withApi(
  { auth: true, body: PatchBody, audit: "commerce.cart.update" },
  async ({ ctx, params, body }) => {
    if (body.savedForLater !== undefined) {
      return commerce.setSavedForLater({ userId: ctx.principal!.userId, itemId: params.id!, saved: body.savedForLater });
    }
    if (body.qty !== undefined) {
      return commerce.updateCartItem({ userId: ctx.principal!.userId, itemId: params.id!, qty: body.qty });
    }
    throw new AppError("VALIDATION", "Provide `qty` or `savedForLater`");
  },
);

export const DELETE = withApi(
  { auth: true, audit: "commerce.cart.remove" },
  async ({ ctx, params }) => commerce.removeCartItem({ userId: ctx.principal!.userId, itemId: params.id! }),
);
