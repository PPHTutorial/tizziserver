import { couriers, delivery } from "@stall/core";
import { withApi } from "@/src/http/route";
export const GET = withApi({ auth: "COURIER" }, async ({ ctx }) => {
  const courierId = await couriers.courierIdForUser(ctx.principal!.userId);
  return delivery.courierEarningsSummary(courierId);
});

