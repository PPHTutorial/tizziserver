import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() });
export const GET = withApi({ auth: "COURIER", query: Query }, async ({ ctx, query }) =>
  couriers.listAvailableJobs(ctx.principal!.userId, query.lat != null && query.lng != null ? { lat: query.lat, lng: query.lng } : undefined),
);

