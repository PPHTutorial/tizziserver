import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ lat: z.number(), lng: z.number(), heading: z.number().optional(), speed: z.number().optional(), accuracy: z.number().optional() });
export const POST = withApi({ auth: "COURIER", body: Body, rateLimit: { limit: 120, windowSec: 60, by: "principal" } }, async ({ ctx, params, body }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.recordBreadcrumb(courierId, params.id!, body);
});

