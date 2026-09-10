import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ code: z.string().max(12).optional(), method: z.enum(["OTP", "QR", "PHOTO", "VENDOR_CONFIRM"]).optional(), packageCount: z.number().int().positive().max(99).optional(), conditionNote: z.string().max(300).optional(), photoKeys: z.array(z.string().max(300)).max(6).optional() });
export const POST = withApi({ auth: "COURIER", body: Body, audit: "delivery.verify_pickup" }, async ({ ctx, params, body }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.verifyPickup(courierId, params.id!, body);
});

