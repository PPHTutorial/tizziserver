import { z } from "zod";
import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: true, body: z.object({ vendorId: z.string() }) }, async ({ ctx, body }) => comms.conversationForVendor(ctx.principal!.userId, body.vendorId));
