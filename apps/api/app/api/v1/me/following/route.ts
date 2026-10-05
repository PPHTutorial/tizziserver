import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(60).optional(),
});

/** Storefronts the caller follows, newest first. */
export const GET = withApi({ auth: true, query: Query }, async ({ ctx, query }) =>
  catalog.listFollowedVendors(ctx.principal!.userId, ctx.platform, query),
);
