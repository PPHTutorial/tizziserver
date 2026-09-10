import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ reason: z.string().min(2).max(300), photoKeys: z.array(z.string().max(300)).max(6).optional() });
export const POST = withApi({ auth: "COURIER", body: Body, audit: "delivery.fail" }, async ({ ctx, params, body }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.courierFailDelivery(courierId, params.id!, body);
});

