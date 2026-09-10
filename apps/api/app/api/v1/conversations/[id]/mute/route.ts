import { z } from "zod";
import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
export const POST = withApi({ auth: true, body: z.object({ muted: z.boolean() }) }, async ({ ctx, params, body }) => comms.setConversationMuted(ctx.principal!.userId, params.id!, body.muted));

