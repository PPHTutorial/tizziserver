import { z } from "zod";
import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(60).optional() });
const Body = z.object({
  kind: z.enum(["TEXT","IMAGE","DOC","VOICE","PRODUCT","ORDER","DELIVERY"]).optional(),
  body: z.string().max(4000).optional(),
  attachments: z.unknown().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export const GET = withApi({ auth: true, query: Query }, async ({ ctx, params, query }) => comms.getMessages(ctx.principal!.userId, params.id!, query));
export const POST = withApi({ auth: true, body: Body, rateLimit: { limit: 60, windowSec: 60, by: "principal" } }, async ({ ctx, params, body }) => comms.sendMessage(ctx.principal!.userId, params.id!, body));

