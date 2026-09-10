import { z } from "zod";
import { analytics } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ metric: z.string(), days: z.coerce.number().int().min(2).max(180).optional(), platformSlug: z.string().optional() });
export const GET = withApi({ auth: ["STAFF", "ADMIN"], query: Query }, async ({ ctx, query }) =>
  analytics.trend(query.platformSlug ?? ctx.platform, query.metric, query.days ?? 30),
);
