import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ vehicleId: z.string(), decision: z.enum(["APPROVE", "REJECT"]), note: z.string().max(300).optional() });
export const POST = withApi({ auth: ["STAFF", "ADMIN"], body: Body, audit: "courier.vehicle.review" }, async ({ ctx, body }) => couriers.reviewVehicle(ctx.principal!.userId, body));

