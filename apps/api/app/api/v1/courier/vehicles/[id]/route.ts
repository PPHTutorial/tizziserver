import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ type: z.enum(["BICYCLE", "MOTORBIKE", "CAR", "VAN", "TRUCK", "OTHER"]).optional(), make: z.string().max(60).optional(), model: z.string().max(60).optional(), color: z.string().max(40).optional(), plate: z.string().max(20).optional(), year: z.number().int().min(1970).max(2100).optional(), photos: z.array(z.string().max(300)).max(8).optional() });
export const PATCH = withApi({ auth: true, body: Body }, async ({ ctx, params, body }) => couriers.updateVehicle(ctx.principal!.userId, params.id!, body));
export const DELETE = withApi({ auth: true }, async ({ ctx, params }) => couriers.removeVehicle(ctx.principal!.userId, params.id!));

