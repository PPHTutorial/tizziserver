import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ photoKeys: z.array(z.string().max(300)).min(1).max(6), notes: z.string().max(500).optional(), lat: z.number().optional(), lng: z.number().optional() });
export const POST = withApi({ auth: "COURIER", body: Body }, async ({ ctx, params, body }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.submitProofOfDelivery(courierId, params.id!, body);
});

