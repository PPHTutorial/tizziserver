import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ active: z.enum(["0", "1"]).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(50).optional() });
export const GET = withApi({ auth: "COURIER", query: Query }, async ({ ctx, query }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.listCourierDeliveries(courierId, { active: query.active === "1", cursor: query.cursor, limit: query.limit });
});

