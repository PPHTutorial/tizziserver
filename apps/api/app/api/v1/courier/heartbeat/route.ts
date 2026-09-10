import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ lat: z.number(), lng: z.number(), heading: z.number().optional(), speed: z.number().optional() });
export const POST = withApi({ auth: "COURIER", body: Body, rateLimit: { limit: 120, windowSec: 60, by: "principal" } }, async ({ ctx, body }) => couriers.heartbeat(ctx.principal!.userId, ctx.platform, body));

