import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

export const GET = withApi(
  { auth: true, query: z.object({ limit: z.coerce.number().int().positive().max(40).optional() }) },
  async ({ ctx, query }) => ({
    items: await catalog.listRecentlyViewed(ctx.principal!.userId, query.limit),
  }),
);

export const POST = withApi(
  { auth: true, body: z.object({ productId: z.string().min(6) }) },
  async ({ ctx, body }) => catalog.recordView(ctx.principal!.userId, body.productId),
);

export const DELETE = withApi(
  { auth: true },
  async ({ ctx }) => catalog.clearRecentlyViewed(ctx.principal!.userId),
);
