import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ type: z.enum(["BICYCLE", "MOTORBIKE", "CAR", "VAN", "TRUCK", "OTHER"]), make: z.string().max(60).optional(), model: z.string().max(60).optional(), color: z.string().max(40).optional(), plate: z.string().max(20).optional(), year: z.number().int().min(1970).max(2100).optional(), photos: z.array(z.string().max(300)).max(8).optional() });
export const POST = withApi({ auth: true, body: Body }, async ({ ctx, body }) => couriers.addVehicle(ctx.principal!.userId, body));

