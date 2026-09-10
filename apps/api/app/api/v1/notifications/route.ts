import { z } from "zod";
import { comms } from "@stall/core";
import { withApi } from "@/src/http/route";
const Query = z.object({ unread: z.enum(["0","1"]).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().positive().max(60).optional() });
export const GET = withApi({ auth: true, query: Query }, async ({ ctx, query }) => comms.listNotifications(ctx.principal!.userId, { unreadOnly: query.unread === "1", cursor: query.cursor, limit: query.limit }));

