import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ reason: z.string().min(2).max(300) });
export const POST = withApi({ auth: "COURIER", body: Body, audit: "delivery.courier_cancel" }, async ({ ctx, params, body }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.courierCancelDelivery(courierId, params.id!, body.reason);
});

