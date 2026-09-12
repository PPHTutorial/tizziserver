import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const VariantInput = z.object({
  sku: z.string().min(1).max(80).optional(),
  name: z.string().min(1).max(80),
  options: z.record(z.string(), z.unknown()).optional(),
  priceMinor: z.number().int().positive(),
});

const Body = z.object({
  title: z.string().min(3).max(140).optional(),
  description: z.string().min(10).max(4000).optional(),
  brand: z.string().max(80).optional(),
  condition: z.enum(["NEW", "USED", "REFURBISHED"]).optional(),
  categoryId: z.string().min(6).optional(),
  priceMinor: z.number().int().positive().optional(),
  images: z.array(z.string()).max(8).optional(),
  video: z.string().optional(),
  variants: z.array(VariantInput).max(20).optional(),
  quantity: z.number().int().nonnegative().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

/** Full editable detail for one of the vendor's own products. */
export const GET = withApi(
  { auth: "VENDOR" },
  async ({ ctx, params }) => catalog.getMyProduct(ctx.principal!.userId, params.id!),
);

/** Edit one of the vendor's own products (draft or live). */
export const PATCH = withApi(
  { auth: "VENDOR", body: Body, audit: "vendor.product.update" },
  async ({ ctx, params, body }) =>
    catalog.updateProductDraft({ userId: ctx.principal!.userId, productId: params.id!, ...body }),
);

/** Soft-delete (archive) the listing — "Delete Listing" in Figma's danger zone. */
export const DELETE = withApi(
  { auth: "VENDOR", audit: "vendor.product.archive" },
  async ({ ctx, params }) => catalog.archiveProduct(ctx.principal!.userId, params.id!),
);
