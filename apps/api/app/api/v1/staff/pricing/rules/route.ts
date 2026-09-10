import { z } from "zod";
import { admin } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  id: z.string().optional(),
  scope: z.enum(["DELIVERY", "SERVICE_FEE", "BOOST", "SURGE", "TAX"]),
  platformSlug: z.string().optional(),
  regionCode: z.string().optional(),
  params: z.record(z.string(), z.unknown()),
  priority: z.number().int().optional(),
  activeFrom: z.coerce.date().optional(),
  activeTo: z.coerce.date().optional(),
});
export const POST = withApi({ auth: ["ADMIN"], body: Body, audit: "pricing_rule.upsert" }, async ({ body }) => admin.upsertPricingRule(body));
