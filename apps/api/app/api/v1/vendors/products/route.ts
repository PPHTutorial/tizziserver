import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional() });

const CreateBody = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(10).max(4000),
  categoryId: z.string().min(6),
  brand: z.string().max(80).optional(),
  condition: z.enum(["NEW", "USED", "REFURBISHED"]).optional(),
  priceMinor: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  images: z.array(z.string()).max(8).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

/** The vendor's own products (all statuses). */
export const GET = withApi(
  { auth: "VENDOR", query: Query },
  async ({ ctx, query }) => ({ items: await catalog.listMyProducts(ctx.principal!.userId, query.status) }),
);

/** Create a product in DRAFT (offer starts PAUSED until publish). */
export const POST = withApi(
  { auth: "VENDOR", body: CreateBody, rateLimit: { limit: 30, windowSec: 60, by: "principal" }, audit: "vendor.product.create" },
  async ({ ctx, body }) =>
    catalog.createProductDraft({
      userId: ctx.principal!.userId,
      platformSlug: ctx.platform,
      ...body,
    }),
);
