import { z } from "zod";
import { couriers } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ lat: z.number(), lng: z.number() });
export const POST = withApi({ auth: "COURIER", body: Body, audit: "courier.online" }, async ({ ctx, body }) => couriers.goOnline(ctx.principal!.userId, ctx.platform, body));

