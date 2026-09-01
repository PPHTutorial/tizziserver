import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().positive().max(50000).optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

/** Vendors with a business location within `radius` metres of a point (PostGIS). */
export const GET = withApi({ query: Query }, async ({ ctx, query }) => ({
  items: await catalog.nearbyVendors({
    platformSlug: ctx.platform,
    lat: query.lat,
    lng: query.lng,
    radiusM: query.radius,
    limit: query.limit,
  }),
}));
