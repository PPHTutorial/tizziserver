import { z } from "zod";
import { analytics } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ days: z.coerce.number().int().min(1).max(365).optional(), platformSlug: z.string().optional() });
export const GET = withApi({ auth: ["STAFF", "ADMIN"], query: Query }, async ({ ctx, query }) =>
  analytics.platformAnalytics(query.platformSlug ?? ctx.platform, { days: query.days }),
);
