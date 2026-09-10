import { z } from "zod";
import { analytics } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ days: z.coerce.number().int().min(1).max(365).optional() });
export const GET = withApi({ auth: "VENDOR", query: Query }, async ({ ctx, query }) =>
  analytics.vendorAnalytics(ctx.principal!.userId, { days: query.days }),
);
