import { z } from "zod";
import { delivery, maps } from "@stall/core";
import { withApi } from "@/src/http/route";

const Body = z.object({
  pickup: z.object({ lat: z.number(), lng: z.number() }),
  dropoff: z.object({ lat: z.number(), lng: z.number() }),
  vehicleType: z.enum(["BICYCLE", "MOTORBIKE", "CAR", "VAN", "TRUCK", "OTHER"]).optional(),
});

export const POST = withApi({ auth: true, body: Body }, async ({ ctx, body }) => {
  const route = await maps.estimateRoute(body.pickup, body.dropoff);
  const q = await delivery.quoteDeliveryFee({ platformSlug: ctx.platform, distanceM: route.distanceM, durationS: route.durationS, vehicleType: body.vehicleType });
  return { distanceM: route.distanceM, durationS: route.durationS, polyline: route.polyline, source: route.source, feeMinor: q.feeMinor, currency: q.currency };
});

