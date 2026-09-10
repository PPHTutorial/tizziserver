import { z } from "zod";
import { ads } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  name: z.string().min(2).max(120).optional(),
  objective: z.enum(["PRODUCT_SALES", "STORE_TRAFFIC", "PRODUCT_LAUNCH", "AUCTION_PROMO"]).optional(),
  boostTierKey: z.string().optional(),
  budgetMinor: z.number().int().positive().optional(),
  dailyCapMinor: z.number().int().positive().optional(),
  targeting: z.object({ categoryIds: z.array(z.string()).optional(), regionCodes: z.array(z.string()).optional(), keywords: z.array(z.string()).optional() }).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});
export const GET = withApi({ auth: "VENDOR", capability: "advertising" }, async ({ ctx, params }) =>
  ads.getCampaign(ctx.principal!.userId, params.id!),
);
export const PATCH = withApi({ auth: "VENDOR", capability: "advertising", body: Body, audit: "campaign.update" }, async ({ ctx, body, params }) =>
  ads.updateCampaign(ctx.principal!.userId, params.id!, body),
);
