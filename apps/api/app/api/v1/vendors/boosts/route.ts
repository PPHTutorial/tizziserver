import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  productId: z.string(),
  boostTierKey: z.string(),
  kind: z.enum(["SEARCH_RANK", "CATEGORY_PIN", "HOME_FEATURE"]).optional(),
  categoryId: z.string().optional(),
  days: z.number().int().min(1).max(30),
});
export const GET = withApi({ auth: "VENDOR", capability: "advertising" }, async ({ ctx }) => ads.listMyBoosts(ctx.principal!.userId));
export const POST = withApi({ auth: "VENDOR", capability: "advertising", body: Body, idempotent: true, audit: "boost.create" }, async ({ ctx, body }) =>
  ads.createBoost({ vendorId: ctx.principal!.userId, platformSlug: ctx.platform, ...body }),
);
