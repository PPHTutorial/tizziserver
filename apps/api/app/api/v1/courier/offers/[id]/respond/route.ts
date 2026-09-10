import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ response: z.enum(["ACCEPTED", "DECLINED"]), reason: z.string().max(200).optional() });
export const POST = withApi({ auth: "COURIER", body: Body, audit: "delivery.offer.respond" }, async ({ ctx, params, body }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.respondToOffer(courierId, params.id!, body.response, body.reason);
});

