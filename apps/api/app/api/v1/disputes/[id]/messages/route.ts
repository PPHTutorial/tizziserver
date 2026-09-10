import { z } from "zod";
import { trust } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: true, body: z.object({ body: z.string().min(1).max(2000) }) }, async ({ ctx, params, body }) => trust.sendDisputeMessage(ctx.principal!.userId, params.id!, body.body, { staff: ["STAFF","ADMIN"].includes(ctx.principal!.activeRole) }));

