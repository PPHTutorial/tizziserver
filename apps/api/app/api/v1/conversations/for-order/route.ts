import { z } from "zod";
import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: true, body: z.object({ orderId: z.string() }) }, async ({ ctx, body }) => comms.conversationForOrder(ctx.principal!.userId, body.orderId));

