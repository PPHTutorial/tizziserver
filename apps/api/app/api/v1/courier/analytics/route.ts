import { z } from "zod";
import { analytics } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ days: z.coerce.number().int().min(1).max(365).optional() });
export const GET = withApi({ auth: "COURIER", query: Query }, async ({ ctx, query }) =>
  analytics.courierAnalytics(ctx.principal!.userId, { days: query.days }),
);
