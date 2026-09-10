import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ id: z.string().optional(), name: z.string().min(1).max(80), centerLat: z.number(), centerLng: z.number(), radiusM: z.number().int().positive().max(60000), enabled: z.boolean().optional() });
export const POST = withApi({ auth: true, body: Body }, async ({ ctx, body }) => couriers.upsertServiceArea(ctx.principal!.userId, body));

