import { z } from "zod";
import { maps } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ oLat: z.coerce.number(), oLng: z.coerce.number(), dLat: z.coerce.number(), dLng: z.coerce.number() });
export const GET = withApi({ auth: true, query: Query, rateLimit: { limit: 60, windowSec: 60, by: "principal" } }, async ({ query }) => {
  const r = await maps.estimateRoute({ lat: query.oLat, lng: query.oLng }, { lat: query.dLat, lng: query.dLng });
  return r;
});

