import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ status: z.string().optional() });
const Body = z.object({
  name: z.string().min(2).max(120),
  objective: z.enum(["PRODUCT_SALES", "STORE_TRAFFIC", "PRODUCT_LAUNCH", "AUCTION_PROMO"]).optional(),
  boostTierKey: z.string().optional(),
  budgetMinor: z.number().int().positive(),
  dailyCapMinor: z.number().int().positive().optional(),
  productIds: z.array(z.string()).max(50).optional(),
  targeting: z.object({ categoryIds: z.array(z.string()).optional(), regionCodes: z.array(z.string()).optional(), keywords: z.array(z.string()).optional() }).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});
export const GET = withApi({ auth: "VENDOR", capability: "advertising", query: Query }, async ({ ctx, query }) =>
  ads.listMyCampaigns(ctx.principal!.userId, { status: query.status as never }),
);
export const POST = withApi({ auth: "VENDOR", capability: "advertising", body: Body, audit: "campaign.create" }, async ({ ctx, body }) =>
  ads.createCampaign({ vendorId: ctx.principal!.userId, platformSlug: ctx.platform, ...body }),
);
