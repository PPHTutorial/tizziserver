import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({
  to: z.enum(["COURIER_EN_ROUTE_PICKUP", "ARRIVED_PICKUP", "PICKED_UP", "EN_ROUTE_DROPOFF", "ARRIVED_DROPOFF", "DELIVERED", "COMPLETED"]),
  lat: z.number().optional(),
  lng: z.number().optional(),
});
export const POST = withApi({ auth: "COURIER", body: Body, audit: "delivery.advance" }, async ({ ctx, params, body }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.courierAdvanceDelivery(courierId, params.id!, body.to, { lat: body.lat, lng: body.lng });
});

