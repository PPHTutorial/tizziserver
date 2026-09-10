import { z } from "zod";
import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ amountMinor: z.number().int().positive(), pin: z.string().min(4).max(6), payoutAccountId: z.string().optional() });
export const GET = withApi({ auth: "COURIER" }, async ({ ctx }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return { items: await delivery.listCourierPayouts(courierId) };
});
export const POST = withApi({ auth: "COURIER", body: Body, audit: "courier.payout.request" }, async ({ ctx, body }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.requestCourierPayout({ userId: ctx.principal!.userId, courierId, platformSlug: ctx.platform, amountMinor: body.amountMinor, pin: body.pin, payoutAccountId: body.payoutAccountId });
});

