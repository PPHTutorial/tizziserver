import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  title: z.string().min(3).max(140).optional(),
  description: z.string().min(10).max(4000).optional(),
  brand: z.string().max(80).optional(),
  categoryId: z.string().min(6).optional(),
  priceMinor: z.number().int().positive().optional(),
  images: z.array(z.string()).max(8).optional(),
  quantity: z.number().int().nonnegative().optional(),
});

/** Edit one of the vendor's own products (draft or live). */
export const PATCH = withApi(
  { auth: "VENDOR", body: Body, audit: "vendor.product.update" },
  async ({ ctx, params, body }) =>
    catalog.updateProductDraft({ userId: ctx.principal!.userId, productId: params.id!, ...body }),
);
