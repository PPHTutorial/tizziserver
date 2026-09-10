import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(100).optional() });
export const GET = withApi({ auth: "COURIER", query: Query }, async ({ ctx, query }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.listCourierEarnings(courierId, query);
});

